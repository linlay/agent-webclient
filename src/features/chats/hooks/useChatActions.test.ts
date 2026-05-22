import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialState } from '@/app/state/state';
import type { Agent, Chat, Team } from '@/app/state/types';
import {
  createReplayState,
  getAutoReadTriggerKey,
  normalizeChatArtifactItems,
  normalizeStartNewConversationDetail,
  replayEvent,
  resolveAttachLastSeq,
  setReplayArtifacts,
  setReplayPlan,
  shouldAutoMarkChatRead,
  useChatActions,
} from '@/features/chats/hooks/useChatActions';

let mockInsideFlushSync = false;

jest.mock('react-dom', () => ({
  flushSync: jest.fn((callback: () => void) => {
    mockInsideFlushSync = true;
    try {
      callback();
    } finally {
      mockInsideFlushSync = false;
    }
  }),
}));

jest.mock('@/app/state/AppContext', () => ({
  useAppContext: jest.fn(),
}));

jest.mock('@/features/transport/lib/apiClientProxy', () => ({
  getChat: jest.fn(),
  markChatRead: jest.fn(),
}));

jest.mock('@/features/workers/hooks/useWorkerData', () => ({
  useWorkerData: jest.fn(() => ({})),
}));

const { useAppContext } = jest.requireMock('@/app/state/AppContext') as {
  useAppContext: jest.Mock;
};

const { getChat } = jest.requireMock('@/features/transport/lib/apiClientProxy') as {
  getChat: jest.Mock;
};

const globalWithBrowserApis = globalThis as typeof globalThis & {
  window?: {
    dispatchEvent: jest.Mock;
    requestAnimationFrame: jest.Mock;
    clearTimeout: jest.Mock;
    location: {
      pathname: string;
      search: string;
    };
  };
  CustomEvent?: typeof CustomEvent;
};

describe('replayEvent tool migration', () => {
  const originalWindow = globalWithBrowserApis.window;
  const originalCustomEvent = globalWithBrowserApis.CustomEvent;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInsideFlushSync = false;
    globalWithBrowserApis.window = {
      dispatchEvent: jest.fn(() => true),
      requestAnimationFrame: jest.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
      clearTimeout: jest.fn(),
      location: {
        pathname: '/',
        search: '',
      },
    };
    globalWithBrowserApis.CustomEvent = class TestCustomEvent<T = unknown> extends Event {
      detail: T;

      constructor(type: string, init?: CustomEventInit<T>) {
        super(type);
        this.detail = init?.detail as T;
      }
    } as typeof CustomEvent;
  });

  afterAll(() => {
    if (originalWindow) {
      globalWithBrowserApis.window = originalWindow;
    } else {
      delete globalWithBrowserApis.window;
    }
    if (originalCustomEvent) {
      globalWithBrowserApis.CustomEvent = originalCustomEvent;
    } else {
      delete globalWithBrowserApis.CustomEvent;
    }
  });

  it('commits loaded chat id and replayed timeline state atomically', async () => {
    const state = createInitialState();
    const dispatchRecords: Array<{ type: string; insideFlushSync: boolean }> = [];
    const dispatch = jest.fn((action: { type: string }) => {
      dispatchRecords.push({
        type: action.type,
        insideFlushSync: mockInsideFlushSync,
      });
    });
    useAppContext.mockReturnValue({
      state,
      dispatch,
      stateRef: { current: state },
      querySessionsRef: { current: new Map() },
      chatQuerySessionIndexRef: { current: new Map() },
      activeQuerySessionRequestIdRef: { current: '' },
    });
    getChat.mockResolvedValue({
      data: {
        events: [
          {
            type: 'request.query',
            requestId: 'req_1',
            chatId: 'chat-1',
            message: 'hello',
            timestamp: 100,
          },
        ],
        runs: [],
      },
    });

    let actions: ReturnType<typeof useChatActions> | null = null;
    const Harness = () => {
      actions = useChatActions();
      return null;
    };
    renderToStaticMarkup(React.createElement(Harness));

    await actions?.loadChat('chat-1');

    expect(dispatchRecords).toEqual(
      expect.arrayContaining([
        { type: 'SET_CHAT_ID', insideFlushSync: true },
        { type: 'RESET_CONVERSATION', insideFlushSync: true },
        { type: 'BATCH_UPDATE', insideFlushSync: true },
      ]),
    );
  });

  it('normalizes agent route new-conversation events as preserved worker sessions', () => {
    expect(
      normalizeStartNewConversationDetail({
        agentKey: 'demo-agent',
        focusComposerOnComplete: true,
      }, 'chat'),
    ).toEqual({
      agentKey: 'demo-agent',
      preserveWorkerContext: true,
      focusComposerOnComplete: true,
    });
  });

  it('keeps legacy new-conversation events scoped to the current mode', () => {
    expect(normalizeStartNewConversationDetail({}, 'chat')).toEqual({
      agentKey: '',
      preserveWorkerContext: false,
      focusComposerOnComplete: false,
    });
    expect(normalizeStartNewConversationDetail({}, 'worker')).toEqual({
      agentKey: '',
      preserveWorkerContext: true,
      focusComposerOnComplete: false,
    });
  });

  it('marks only unread chats for auto-read on load', () => {
    expect(
      shouldAutoMarkChatRead({
        chatId: 'chat_unread',
        read: { isRead: false },
      }),
    ).toBe(true);

    expect(
      shouldAutoMarkChatRead({
        chatId: 'chat_read',
        read: { isRead: true },
      }),
    ).toBe(false);

    expect(
      shouldAutoMarkChatRead({
        chatId: 'chat_missing_read',
      }),
    ).toBe(false);
  });

  it('builds a stable auto-read trigger key only for unread chats', () => {
    expect(
      getAutoReadTriggerKey({
        chatId: 'chat_unread',
        lastRunId: 'run_1',
        updatedAt: 123,
        read: {
          isRead: false,
          readAt: 111,
          readRunId: 'run_0',
        },
      }),
    ).toBe('chat_unread|run_1|123|111|run_0');

    expect(
      getAutoReadTriggerKey({
        chatId: 'chat_read',
        lastRunId: 'run_1',
        updatedAt: 123,
        read: {
          isRead: true,
          readAt: 123,
          readRunId: 'run_1',
        },
      }),
    ).toBe('');
  });

  it('resolves attach lastSeq from replayed chat events instead of activeRun.lastSeq', () => {
    expect(
      resolveAttachLastSeq([
        { seq: 1, type: 'chat.start' },
        { seq: 2, type: 'run.start', runId: 'run_1' },
        { seq: 3, type: 'request.query', runId: 'run_1' },
      ], 'run_1'),
    ).toBe(3);

    expect(resolveAttachLastSeq([], 'run_1')).toBe(0);
    expect(
      resolveAttachLastSeq([
        { seq: -1, runId: 'run_1' },
        { seq: Number.NaN, runId: 'run_1' },
        { type: 'content.delta', runId: 'run_1' },
      ], 'run_1'),
    ).toBe(0);

    expect(
      resolveAttachLastSeq([
        { seq: 1, runId: 'run_old' },
        { seq: 2, runId: 'run_1' },
        { seq: 7, runId: 'run_old' },
        { seq: 5, runId: 'run_1' },
      ], 'run_1'),
    ).toBe(5);
  });

  it('stores viewportKey from new MCP payload and keeps toolName for display', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'tool.start',
      toolId: 'call_f1494c0a4c4646cc81a41585',
      toolName: 'email.search',
      viewportKey: 'viewport_email_search',
      runId: 'run_1',
      timestamp: 100,
    });

    const toolState = state.toolStates.get('call_f1494c0a4c4646cc81a41585');
    const nodeId = state.toolNodeById.get('call_f1494c0a4c4646cc81a41585');
    const node = nodeId ? state.timelineNodes.get(nodeId) : null;

    expect(toolState?.viewportKey).toBe('viewport_email_search');
    expect(toolState).not.toHaveProperty('toolApi');
    expect(node?.toolName).toBe('email.search');
    expect(node?.viewportKey).toBe('viewport_email_search');
  });

  it('replays tool.args into parsed toolParams and pretty argsText', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'tool.start',
      toolId: 'tool_args',
      toolName: 'demo.run',
      timestamp: 100,
    });
    replayEvent(state, {
      type: 'tool.args',
      toolId: 'tool_args',
      delta: '{"foo":"bar"}',
      timestamp: 110,
    });

    expect(state.toolStates.get('tool_args')?.toolParams).toEqual({ foo: 'bar' });
    expect(state.timelineNodes.get('tool_0')).toMatchObject({
      argsText: '{\n  "foo": "bar"\n}',
      status: 'running',
    });
  });

  it('replays streamed tool events into synthesized debug snapshots', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'tool.start',
      toolId: 'tool_debug',
      toolName: 'demo.run',
      runId: 'run_1',
      timestamp: 100,
    });
    replayEvent(state, {
      type: 'tool.args',
      toolId: 'tool_debug',
      delta: '{"foo":"bar"}',
      timestamp: 110,
    });
    replayEvent(state, {
      type: 'tool.end',
      toolId: 'tool_debug',
      timestamp: 120,
    });
    replayEvent(state, {
      type: 'tool.result',
      toolId: 'tool_debug',
      result: 'ok',
      timestamp: 130,
    });

    expect(state.events.map((event) => event.type)).toEqual([
      'tool.start',
      'tool.args',
      'tool.end',
      'tool.result',
    ]);
    expect(state.debugEvents.map((event) => event.type)).toEqual([
      'tool.snapshot',
      'tool.result',
    ]);
    expect(state.debugEvents[0]).toMatchObject({
      type: 'tool.snapshot',
      toolId: 'tool_debug',
      toolName: 'demo.run',
      runId: 'run_1',
      arguments: '{"foo":"bar"}',
      timestamp: 120,
    });
  });

  it('replays streamed text events into synthesized debug snapshots', () => {
    const state = createReplayState();

    [
      { type: 'content.start', contentId: 'content_debug', text: 'A', runId: 'run_1' },
      { type: 'content.delta', contentId: 'content_debug', delta: 'B' },
      { type: 'content.end', contentId: 'content_debug', timestamp: 120 },
      { type: 'reasoning.start', reasoningId: 'reasoning_debug', reasoningLabel: 'Think', text: 'C', runId: 'run_1' },
      { type: 'reasoning.delta', reasoningId: 'reasoning_debug', delta: 'D' },
      { type: 'reasoning.end', reasoningId: 'reasoning_debug', timestamp: 121 },
      { type: 'planning.start', planningId: 'planning_debug', planningLabel: 'Plan', text: 'E', runId: 'run_1' },
      { type: 'planning.delta', planningId: 'planning_debug', delta: 'F' },
      { type: 'planning.end', planningId: 'planning_debug', timestamp: 122 },
    ].forEach((event) => replayEvent(state, event));

    expect(state.debugEvents.map((event) => event.type)).toEqual([
      'content.snapshot',
      'reasoning.snapshot',
      'planning.snapshot',
    ]);
    expect(state.debugEvents).toEqual([
      expect.objectContaining({ type: 'content.snapshot', text: 'AB' }),
      expect.objectContaining({ type: 'reasoning.snapshot', reasoningLabel: 'Think', text: 'CD' }),
      expect.objectContaining({ type: 'planning.snapshot', planningLabel: 'Plan', text: 'EF' }),
    ]);
  });

  it('preserves toolName when later tool events omit it', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'tool.start',
      toolId: 'tool_args_case',
      toolName: 'email.list_accounts',
      timestamp: 100,
    });
    replayEvent(state, {
      type: 'tool.result',
      toolId: 'tool_args_case',
      result: 'ok',
      timestamp: 110,
    });

    const nodeId = state.toolNodeById.get('tool_args_case');
    const node = nodeId ? state.timelineNodes.get(nodeId) : null;

    expect(node?.toolName).toBe('email.list_accounts');
  });

  it('marks plan tasks completed for task.complete', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'plan.update',
      planId: 'plan_1',
      plan: [
        { taskId: 'task_1', description: 'step 1' },
        { taskId: 'task_2', description: 'step 2' },
      ],
    });
    replayEvent(state, {
      type: 'task.start',
      taskId: 'task_1',
    });
    replayEvent(state, {
      type: 'task.complete',
      taskId: 'task_1',
    });

    expect(state.planRuntimeByTaskId.get('task_1')?.status).toBe('completed');
    expect(state.planCurrentRunningTaskId).toBe('');
  });

  it('replays artifact.publish into persistent artifact state', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'artifact.publish',
      runId: 'run_1',
      timestamp: 120,
      artifactCount: 2,
      artifacts: [
        {
          artifactId: 'artifact_1',
          type: 'file',
          name: 'run.log',
          mimeType: 'text/plain',
          sha256: 'sha-log',
          sizeBytes: 512,
          url: 'https://example.com/run.log',
        },
        {
          artifactId: 'artifact_2',
          type: 'file',
          name: 'notes.txt',
          mimeType: 'text/plain',
          sha256: 'sha-notes',
          sizeBytes: 128,
          url: 'https://example.com/notes.txt',
        },
      ],
    });

    expect(state.artifacts).toEqual([
      {
        artifactId: 'artifact_1',
        timestamp: 120,
        artifact: {
          type: 'file',
          name: 'run.log',
          mimeType: 'text/plain',
          sha256: 'sha-log',
          sizeBytes: 512,
          url: 'https://example.com/run.log',
        },
      },
      {
        artifactId: 'artifact_2',
        timestamp: 120,
        artifact: {
          type: 'file',
          name: 'notes.txt',
          mimeType: 'text/plain',
          sha256: 'sha-notes',
          sizeBytes: 128,
          url: 'https://example.com/notes.txt',
        },
      },
    ]);
  });

  it('applies getChat artifact.items snapshots over replayed artifacts', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'artifact.publish',
      runId: 'run_1',
      timestamp: 120,
      artifacts: [
        {
          artifactId: 'artifact_old',
          type: 'file',
          name: 'old.log',
          mimeType: 'text/plain',
          sha256: 'sha-old',
          sizeBytes: 128,
          url: 'https://example.com/old.log',
        },
      ],
    });

    setReplayArtifacts(state, [
      {
        artifactId: 'artifact_new',
        timestamp: 0,
        artifact: {
          type: 'file',
          name: 'new.log',
          mimeType: 'text/plain',
          sha256: 'sha-new',
          sizeBytes: 256,
          url: 'https://example.com/new.log',
        },
      },
    ]);

    expect(state.artifacts).toEqual([
      {
        artifactId: 'artifact_new',
        timestamp: 0,
        artifact: {
          type: 'file',
          name: 'new.log',
          mimeType: 'text/plain',
          sha256: 'sha-new',
          sizeBytes: 256,
          url: 'https://example.com/new.log',
        },
      },
    ]);
  });

  it('normalizes getChat artifact.items payloads into published artifacts', () => {
    expect(
      normalizeChatArtifactItems({
        items: [
          {
            artifactId: 'artifact_1',
            type: 'file',
            name: 'report.pdf',
            mimeType: 'application/pdf',
            sha256: 'sha-report',
            sizeBytes: 1024,
            url: 'https://example.com/report.pdf',
          },
        ],
      }),
    ).toEqual([
      {
        artifactId: 'artifact_1',
        timestamp: 0,
        artifact: {
          type: 'file',
          name: 'report.pdf',
          mimeType: 'application/pdf',
          sha256: 'sha-report',
          sizeBytes: 1024,
          url: 'https://example.com/report.pdf',
        },
      },
    ]);
  });

  it('applies getChat plan snapshots without clearing matching runtime state', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'plan.update',
      planId: 'plan_1',
      plan: [{ taskId: 'task_1', description: 'old step' }],
    });
    replayEvent(state, {
      type: 'task.start',
      taskId: 'task_1',
    });

    setReplayPlan(
      state,
      {
        planId: 'plan_1',
        plan: [{ taskId: 'task_1', description: 'new step' }],
      },
      { resetRuntime: false },
    );

    expect(state.plan).toEqual({
      planId: 'plan_1',
      plan: [{ taskId: 'task_1', description: 'new step' }],
    });
    expect(state.planRuntimeByTaskId.get('task_1')?.status).toBe('running');
    expect(state.planCurrentRunningTaskId).toBe('task_1');
  });

  it('clears plan runtime when getChat plan snapshot replaces a different plan', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'plan.update',
      planId: 'plan_1',
      plan: [{ taskId: 'task_1', description: 'step 1' }],
    });
    replayEvent(state, {
      type: 'task.start',
      taskId: 'task_1',
    });

    setReplayPlan(
      state,
      {
        planId: 'plan_2',
        plan: [{ taskId: 'task_2', description: 'step 2' }],
      },
      { resetRuntime: true },
    );

    expect(state.plan).toEqual({
      planId: 'plan_2',
      plan: [{ taskId: 'task_2', description: 'step 2' }],
    });
    expect(state.planRuntimeByTaskId.size).toBe(0);
    expect(state.planCurrentRunningTaskId).toBe('');
    expect(state.planLastTouchedTaskId).toBe('');
  });

  it('replays request.steer as a user timeline node', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'request.steer',
      steerId: 'steer_1',
      message: '请收敛一点',
      timestamp: 100,
    });
    replayEvent(state, {
      type: 'run.cancel',
      runId: 'run_1',
      timestamp: 120,
    });

    const node = state.timelineNodes.get('steer_steer_1');
    expect(node).toMatchObject({ role: 'user', messageVariant: 'steer', text: '请收敛一点' });
    expect(state.events.at(-1)?.type).toBe('run.cancel');
  });

  it('replays request.query references into user attachments for history chats', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'request.query',
      requestId: 'req_history_1',
      message: '解析该文件',
      references: [
        {
          id: 'i1',
          type: 'image',
          name: 'drmjl-nfjxc-001.ico',
          sizeBytes: 67646,
        },
      ],
      timestamp: 100,
    });

    expect(state.timelineNodes.get('user_req_history_1')).toMatchObject({
      role: 'user',
      text: '解析该文件',
      attachments: [
        {
          name: 'drmjl-nfjxc-001.ico',
          size: 67646,
        },
      ],
    });
  });
});
