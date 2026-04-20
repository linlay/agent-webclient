import { createInitialState } from '@/app/state/AppContext';
import type { AgentEvent, TimelineNode } from '@/app/state/types';
import type { EventCommand } from '@/features/timeline/lib/eventProcessor';
import { reduceActiveAwaiting } from '@/features/tools/lib/awaitingRuntime';
import { processEvent } from '@/features/timeline/lib/eventProcessor';
import {
  createLiveProcessorState,
  createLocalCacheFromState,
  findMatchingPendingSteer,
  shouldSyncLiveCache,
} from '@/features/timeline/hooks/useAgentEventHandler';

function applyCommands(
  state: ReturnType<typeof createInitialState>,
  commands: EventCommand[],
): void {
  for (const command of commands) {
    switch (command.cmd) {
      case 'SET_CONTENT_NODE_ID':
        state.contentNodeById.set(command.contentId, command.nodeId);
        state.timelineCounter += 1;
        break;
      case 'SET_REASONING_NODE_ID':
        state.reasoningNodeById.set(command.reasoningId, command.nodeId);
        state.timelineCounter += 1;
        break;
      case 'SET_TOOL_NODE_ID':
        state.toolNodeById.set(command.toolId, command.nodeId);
        state.timelineCounter += 1;
        break;
      case 'SET_TIMELINE_NODE':
        state.timelineNodes.set(command.id, command.node);
        break;
      case 'APPEND_TIMELINE_ORDER':
        state.timelineOrder.push(command.nodeId);
        break;
      case 'SET_TOOL_STATE':
        state.toolStates.set(command.toolId, command.state);
        break;
      case 'SET_ACTIVE_REASONING_KEY':
        state.activeReasoningKey = command.key;
        break;
      case 'SET_CHAT_ID':
        state.chatId = command.chatId;
        break;
      case 'SET_RUN_ID':
        state.runId = command.runId;
        break;
      default:
        break;
    }
  }
}

describe('findMatchingPendingSteer', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => '',
      },
    });
  });

  it('matches only when steerId exists in pending steers', () => {
    const state = {
      ...createInitialState(),
      pendingSteers: [
        {
          steerId: '55a9ce3e-0ae2-4cbd-8224-0e0dd4d62c34',
          message: '突然计划去北京。',
          requestId: 'req_1773506656934_drp9ko',
          runId: 'mmqk2gej',
          createdAt: 100,
        },
      ],
    };

    const matched = findMatchingPendingSteer(state, {
      type: 'request.steer',
      steerId: '55a9ce3e-0ae2-4cbd-8224-0e0dd4d62c34',
      requestId: 'req_1773506656934_drp9ko',
      message: '突然计划去北京。',
    });

    expect(matched?.message).toBe('突然计划去北京。');
  });

  it('does not fallback to requestId when steerId does not match', () => {
    const state = {
      ...createInitialState(),
      pendingSteers: [
        {
          steerId: 'pending_steer_id',
          message: '突然计划去北京。',
          requestId: 'req_1773506656934_drp9ko',
          runId: 'mmqk2gej',
          createdAt: 100,
        },
      ],
    };

    const matched = findMatchingPendingSteer(state, {
      type: 'request.steer',
      steerId: '55a9ce3e-0ae2-4cbd-8224-0e0dd4d62c34',
      requestId: 'req_1773506656934_drp9ko',
      message: '突然计划去北京。',
    });

    expect(matched).toBeNull();
  });
});

describe('shouldSyncLiveCache', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => '',
      },
    });
  });

  it('requests cache rebuild when restored state text is ahead of cached node text', () => {
    const baseState = createInitialState();
    const contentNode: TimelineNode = {
      id: 'content_0',
      kind: 'content',
      contentId: 'content_1',
      text: 'Hello world',
      segments: [],
      ts: 100,
    };
    const state = {
      ...baseState,
      chatId: 'chat_1',
      runId: 'run_1',
      timelineCounter: 1,
      timelineNodes: new Map([['content_0', contentNode]]),
      timelineOrder: ['content_0'],
      contentNodeById: new Map([['content_1', 'content_0']]),
    };

    const cache = createLocalCacheFromState(state);
    cache.nodeText.set('content_0', 'Hello');
    cache.nodeById.set('content_0', { ...contentNode, text: 'Hello' });

    expect(shouldSyncLiveCache(cache, state)).toBe(true);
  });

  it('does not rebuild when live cache text is ahead of state during streaming', () => {
    const baseState = createInitialState();
    const contentNode: TimelineNode = {
      id: 'content_0',
      kind: 'content',
      contentId: 'content_1',
      text: 'Hello',
      segments: [],
      ts: 100,
    };
    const state = {
      ...baseState,
      chatId: 'chat_1',
      runId: 'run_1',
      streaming: true,
      timelineCounter: 1,
      timelineNodes: new Map([['content_0', contentNode]]),
      timelineOrder: ['content_0'],
      contentNodeById: new Map([['content_1', 'content_0']]),
    };

    const cache = createLocalCacheFromState(state);
    cache.nodeText.set('content_0', 'Hello world');
    cache.nodeById.set('content_0', { ...contentNode, text: 'Hello world' });

    expect(shouldSyncLiveCache(cache, state)).toBe(false);
  });

  it('keeps live awaiting state authoritative until React state catches up', () => {
    const baseState = createInitialState();
    const state = {
      ...baseState,
      chatId: 'chat_1',
      runId: 'run_1',
      streaming: true,
      timelineOrder: ['message_1'],
      activeAwaiting: null,
    };

    const cache = createLocalCacheFromState(state);
    cache.activeAwaiting = reduceActiveAwaiting(cache.activeAwaiting, {
      type: 'awaiting.ask',
      runId: 'run_1',
      awaitingId: 'await_1',
      mode: 'question',
    });

    expect(cache.activeAwaiting).toMatchObject({
      awaitingId: 'await_1',
      questions: [],
    });
    expect(shouldSyncLiveCache(cache, state)).toBe(false);

    const hydrated = reduceActiveAwaiting(cache.activeAwaiting, {
      type: 'awaiting.payload',
      awaitingId: 'await_1',
      questions: [
        {
          id: 'continue',
          type: 'select',
          question: '继续执行吗？',
          options: [
            {
              label: '继续',
              description: '允许继续执行',
            },
          ],
        },
      ],
    });

    expect(hydrated?.questions).toHaveLength(1);
    expect(hydrated?.questions[0]).toMatchObject({
      question: '继续执行吗？',
    });
  });

  it('keeps legacy awaiting.ask sessions authoritative when viewport fields are omitted', () => {
    const baseState = createInitialState();
    const state = {
      ...baseState,
      chatId: 'chat_1',
      runId: 'run_legacy_1',
      streaming: true,
      timelineOrder: ['message_1'],
      activeAwaiting: null,
    };

    const cache = createLocalCacheFromState(state);
    cache.activeAwaiting = reduceActiveAwaiting(cache.activeAwaiting, {
      type: 'awaiting.ask',
      runId: 'run_legacy_1',
      awaitingId: 'await_legacy_1',
      questions: [
        {
          type: 'select',
          question: '您希望我演示哪种提问式确认场景？',
          options: [
            {
              label: '通用确认',
              description: '日常事务确认',
            },
          ],
        },
      ],
    });

    expect(cache.activeAwaiting).toMatchObject({
      awaitingId: 'await_legacy_1',
      mode: 'question',
    });
    expect(cache.activeAwaiting?.questions).toHaveLength(1);
    expect(shouldSyncLiveCache(cache, state)).toBe(false);
  });

  it('rebuilds when React state has hydrated questions for the same awaiting session', () => {
    const baseState = createInitialState();
    const state = {
      ...baseState,
      chatId: 'chat_1',
      runId: 'run_1',
      streaming: true,
      timelineOrder: ['message_1'],
      activeAwaiting: {
        key: 'run_1#await_1',
        awaitingId: 'await_1',
        runId: 'run_1',
        timeout: 60,
        mode: 'question' as const,
        questions: [
          {
            id: 'continue',
            type: 'select' as const,
            question: '继续执行吗？',
            options: [
              {
                label: '继续',
                description: '允许继续执行',
              },
            ],
          },
        ],
      },
    };

    const cache = createLocalCacheFromState({
      ...state,
      activeAwaiting: {
        ...state.activeAwaiting,
        questions: [],
      },
    });

    expect(shouldSyncLiveCache(cache, state)).toBe(true);
  });

  it('marks awaiting as resolvedByOther when awaiting.answer matches the active dialog', () => {
    const current = {
      key: 'run_1#await_1',
      awaitingId: 'await_1',
      runId: 'run_1',
      timeout: 60,
      mode: 'question' as const,
      questions: [
        {
          id: 'continue',
          type: 'select' as const,
          question: '继续执行吗？',
          options: [
            {
              label: '继续',
              description: '允许继续执行',
            },
          ],
        },
      ],
    };

    const next = reduceActiveAwaiting(current, {
      type: 'awaiting.answer',
      awaitingId: 'await_1',
      runId: 'run_1',
      status: 'answered',
    });

    expect(next).toMatchObject({
      awaitingId: 'await_1',
      resolvedByOther: true,
    });
    expect(next?.questions).toHaveLength(1);
  });

  it('rebuilds cache when html awaiting runtime state is patched in React state', () => {
    const baseState = createInitialState();
    const state = {
      ...baseState,
      chatId: 'chat_1',
      runId: 'run_1',
      streaming: true,
      timelineOrder: ['message_1'],
      activeAwaiting: {
        key: 'run_1#await_1',
        awaitingId: 'await_1',
        runId: 'run_1',
        timeout: 60,
        mode: 'form' as const,
        viewportKey: 'leave_form',
        viewportType: 'html' as const,
        forms: [
          {
            id: 'leave_form',
            action: '提交请假申请',
            payload: null,
          },
        ],
        loading: false,
        loadError: '',
        viewportHtml: '<html><body>form</body></html>',
      },
    };

    const cache = createLocalCacheFromState({
      ...state,
      activeAwaiting: {
        ...state.activeAwaiting,
        viewportHtml: '',
      },
    });

    expect(shouldSyncLiveCache(cache, state)).toBe(true);
  });

  it('rebuilds cache when html awaiting mode or payload changes in React state', () => {
    const baseState = createInitialState();
    const state = {
      ...baseState,
      chatId: 'chat_1',
      runId: 'run_1',
      streaming: true,
      timelineOrder: ['message_1'],
      activeAwaiting: {
        key: 'run_1#await_1',
        awaitingId: 'await_1',
        runId: 'run_1',
        timeout: 60,
        mode: 'form' as const,
        viewportKey: 'leave_form',
        viewportType: 'html' as const,
        forms: [
          {
            id: 'leave_form',
            action: '提交请假申请',
            payload: {
              employee_id: 'E1001',
            },
          },
        ],
        loading: false,
        loadError: '',
        viewportHtml: '<html><body>form</body></html>',
      },
    };

    const cache = createLocalCacheFromState({
      ...state,
      activeAwaiting: {
        ...state.activeAwaiting,
        forms: [
          {
            id: 'leave_form',
            action: '提交请假申请',
            payload: null,
          },
        ],
      },
    });

    expect(shouldSyncLiveCache(cache, state)).toBe(true);
  });
});

describe('createLiveProcessorState', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => '',
      },
    });
  });

  it('appends content deltas from cache text when cache is ahead of React state', () => {
    const state = createInitialState();
    const contentNode: TimelineNode = {
      id: 'content_0',
      kind: 'content',
      contentId: 'content_1',
      text: 'ab',
      segments: [],
      ts: 100,
    };
    state.chatId = 'chat_1';
    state.runId = 'run_1';
    state.streaming = true;
    state.timelineCounter = 1;
    state.timelineNodes.set(contentNode.id, contentNode);
    state.timelineOrder.push(contentNode.id);
    state.contentNodeById.set('content_1', contentNode.id);

    const cache = createLocalCacheFromState(state);
    cache.nodeText.set(contentNode.id, 'abc');
    cache.nodeById.set(contentNode.id, { ...contentNode, text: 'abc' });

    const commands = processEvent(
      { type: 'content.delta', contentId: 'content_1', delta: 'd' },
      createLiveProcessorState(cache, state),
      { mode: 'live', reasoningExpandedDefault: true },
    );

    expect(commands).toContainEqual({
      cmd: 'SET_TIMELINE_NODE',
      id: 'content_0',
      node: expect.objectContaining({
        kind: 'content',
        contentId: 'content_1',
        text: 'abcd',
      }),
    });
  });

  it('appends reasoning deltas from cache text when cache is ahead of React state', () => {
    const state = createInitialState();
    const thinkingNode: TimelineNode = {
      id: 'thinking_0',
      kind: 'thinking',
      text: 'ab',
      status: 'running',
      expanded: true,
      ts: 100,
    };
    state.chatId = 'chat_1';
    state.runId = 'run_1';
    state.streaming = true;
    state.timelineCounter = 1;
    state.timelineNodes.set(thinkingNode.id, thinkingNode);
    state.timelineOrder.push(thinkingNode.id);
    state.reasoningNodeById.set('reasoning_1', thinkingNode.id);
    state.activeReasoningKey = 'reasoning_1';

    const cache = createLocalCacheFromState(state);
    cache.nodeText.set(thinkingNode.id, 'abc');
    cache.nodeById.set(thinkingNode.id, { ...thinkingNode, text: 'abc' });

    const commands = processEvent(
      { type: 'reasoning.delta', reasoningId: 'reasoning_1', delta: 'd' },
      createLiveProcessorState(cache, state),
      { mode: 'live', reasoningExpandedDefault: true },
    );

    expect(commands).toContainEqual({
      cmd: 'SET_TIMELINE_NODE',
      id: 'thinking_0',
      node: expect.objectContaining({
        kind: 'thinking',
        text: 'abcd',
        status: 'running',
      }),
    });
  });

  it('allocates a new content node when cache already marks the current node completed', () => {
    const state = createInitialState();
    const contentNode: TimelineNode = {
      id: 'content_0',
      kind: 'content',
      contentId: 'content_1',
      text: 'abc',
      segments: [],
      ts: 100,
    };
    state.chatId = 'chat_1';
    state.runId = 'run_1';
    state.streaming = true;
    state.timelineCounter = 1;
    state.timelineNodes.set(contentNode.id, contentNode);
    state.timelineOrder.push(contentNode.id);
    state.contentNodeById.set('content_1', contentNode.id);

    const cache = createLocalCacheFromState(state);
    cache.nodeById.set(contentNode.id, { ...contentNode, status: 'completed' });

    const commands = processEvent(
      { type: 'content.delta', contentId: 'content_1', delta: 'd' },
      createLiveProcessorState(cache, state),
      { mode: 'live', reasoningExpandedDefault: true },
    );

    expect(commands).toContainEqual({
      cmd: 'SET_CONTENT_NODE_ID',
      contentId: 'content_1',
      nodeId: 'content_1',
    });
    expect(commands).toContainEqual({
      cmd: 'APPEND_TIMELINE_ORDER',
      nodeId: 'content_1',
    });
    expect(commands).toContainEqual({
      cmd: 'SET_TIMELINE_NODE',
      id: 'content_1',
      node: expect.objectContaining({
        kind: 'content',
        contentId: 'content_1',
        text: 'd',
      }),
    });
  });

  it('keeps appending correctly across consecutive live content deltas while state lags behind', () => {
    const state = createInitialState();
    const contentNode: TimelineNode = {
      id: 'content_0',
      kind: 'content',
      contentId: 'content_1',
      text: 'ab',
      segments: [],
      ts: 100,
    };
    state.chatId = 'chat_1';
    state.runId = 'run_1';
    state.streaming = true;
    state.timelineCounter = 1;
    state.timelineNodes.set(contentNode.id, contentNode);
    state.timelineOrder.push(contentNode.id);
    state.contentNodeById.set('content_1', contentNode.id);

    const cache = createLocalCacheFromState(state);
    cache.nodeText.set(contentNode.id, 'abc');
    cache.nodeById.set(contentNode.id, { ...contentNode, text: 'abc' });

    const firstCommands = processEvent(
      { type: 'content.delta', contentId: 'content_1', delta: 'd' },
      createLiveProcessorState(cache, state),
      { mode: 'live', reasoningExpandedDefault: true },
    );
    applyCommands(state, firstCommands);

    const latestNode = firstCommands.find((command) => command.cmd === 'SET_TIMELINE_NODE');
    if (latestNode?.cmd === 'SET_TIMELINE_NODE') {
      cache.nodeById.set(latestNode.id, latestNode.node);
      cache.nodeText.set(latestNode.id, latestNode.node.text || '');
    }

    const secondCommands = processEvent(
      { type: 'content.delta', contentId: 'content_1', delta: 'e' },
      createLiveProcessorState(cache, state),
      { mode: 'live', reasoningExpandedDefault: true },
    );

    expect(secondCommands).toContainEqual({
      cmd: 'SET_TIMELINE_NODE',
      id: 'content_0',
      node: expect.objectContaining({
        kind: 'content',
        contentId: 'content_1',
        text: 'abcde',
      }),
    });
  });
});
