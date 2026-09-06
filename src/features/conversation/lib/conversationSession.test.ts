import { createInitialState } from '@/app/state/AppContext';
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import {
  applyPendingSessionUpdates,
  buildConversationStateUpdates,
  cloneConversationSnapshot,
  createLiveQuerySession,
  markSessionSnapshotApplied,
  snapshotConversationState,
} from '@/features/conversation/lib/conversationSession';

describe('conversation session restore', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => '',
      },
    });
  });

  it('preserves each snapshot entry point field and scalar contract', () => {
    const state = {
      ...createInitialState(),
      chatId: ' chat_1 ',
      runId: ' run_1 ',
      currentRunAgentKey: ' agent_1 ',
      requestId: ' req_1 ',
      planCurrentRunningTaskId: ' task_1 ',
      planLastTouchedTaskId: ' task_2 ',
      activeReasoningKey: ' reasoning_1 ',
      extra: { retained: true },
    };
    const snapshot = snapshotConversationState(state);
    const rawSnapshot = { ...snapshot, chatId: state.chatId, extra: state.extra };
    const cloned = cloneConversationSnapshot(rawSnapshot);
    const updates = buildConversationStateUpdates(rawSnapshot);

    expect(snapshot).toMatchObject({
      chatId: 'chat_1', runId: 'run_1', currentRunAgentKey: 'agent_1', requestId: 'req_1',
      planCurrentRunningTaskId: 'task_1', planLastTouchedTaskId: 'task_2', activeReasoningKey: 'reasoning_1',
    });
    expect(snapshot).not.toHaveProperty('extra');
    expect(snapshot).not.toHaveProperty('accessToken');
    expect(cloned).toMatchObject({ chatId: ' chat_1 ', extra: state.extra });
    expect((cloned as typeof rawSnapshot).extra).toBe(state.extra);
    expect(updates.chatId).toBe(' chat_1 ');
    expect(updates).not.toHaveProperty('extra');
    expect(updates).not.toHaveProperty('activeTaskIds');
    expect(updates).toMatchObject({
      artifactExpanded: false, artifactManualOverride: null, artifactAutoCollapseTimer: null,
      timelineDomCache: new Map(),
      renderQueue: { dirtyNodeIds: new Set(), scheduled: false, stickToBottomRequested: false, fullSyncNeeded: false },
    });
    expect(Object.keys(updates).sort()).toEqual([
      ...Object.keys(snapshot).filter((key) => key !== 'activeTaskIds'),
      'timelineDomCache', 'renderQueue', 'artifactExpanded', 'artifactManualOverride', 'artifactAutoCollapseTimer',
    ].sort());
  });

  it('keeps tolerant snapshot plan cloning distinct from strict update and replay cloning', () => {
    const state = createInitialState();
    state.plan = { planId: 'plan_1', plan: null } as unknown as NonNullable<typeof state.plan>;
    expect(snapshotConversationState(state).plan?.plan).toEqual([]);
    const snapshot = { ...snapshotConversationState(state), plan: state.plan };
    expect(cloneConversationSnapshot(snapshot).plan?.plan).toEqual([]);
    expect(() => buildConversationStateUpdates(snapshot)).toThrow(TypeError);
    expect(() => applyPendingSessionUpdates(snapshot, createLiveQuerySession({ requestId: 'req_1' }))).toThrow(TypeError);
  });

  it('preserves collection isolation and intentionally shallow values in all snapshot copies', () => {
    const source = snapshotConversationState(createInitialState());
    source.timelineNodes.set('tool_1', {
      id: 'tool_1', kind: 'tool', ts: 1,
      toolOutput: { lastChunkIndex: 0, truncated: false, segments: [{ stream: 'stdout', text: 'output' }] },
    });
    source.timelineOrder.push('tool_1');
    source.events.push({ type: 'run.start', runId: 'run_1' });
    source.activeTaskIds.add('task_1');
    const copies = [
      snapshotConversationState({ ...createInitialState(), ...source }),
      cloneConversationSnapshot(source),
      buildConversationStateUpdates(source),
    ];
    for (const copy of copies) {
      for (const [key, value] of Object.entries(source)) {
        if (key === 'activeTaskIds' && !('activeTaskIds' in copy)) continue;
        if (value instanceof Map || value instanceof Set || Array.isArray(value)) {
          expect(copy[key as keyof typeof copy]).not.toBe(value);
          expect(copy[key as keyof typeof copy]).toEqual(value);
        }
      }
      expect(copy.events?.[0]).toBe(source.events[0]);
      const tool = copy.timelineNodes?.get('tool_1');
      expect(tool).not.toBe(source.timelineNodes.get('tool_1'));
      expect(tool?.toolOutput?.segments[0]).not.toBe(source.timelineNodes.get('tool_1')?.toolOutput?.segments[0]);
    }
    expect(copies[0].timelineNodes).not.toBe(copies[1].timelineNodes);
    expect(copies[1].timelineNodes).not.toBe(copies[2].timelineNodes);
  });

  it('deep-clones transient tool output in conversation snapshots', () => {
    const sourceNode: TimelineNode = {
      id: 'tool_live',
      kind: 'tool',
      toolId: 'call_1',
      status: 'running',
      ts: 100,
      toolOutput: {
        lastChunkIndex: 0,
        truncated: false,
        segments: [{ stream: 'stdout', text: 'scan qr\n' }],
      },
    };
    const snapshot = snapshotConversationState({
      ...createInitialState(),
      timelineNodes: new Map([[sourceNode.id, sourceNode]]),
      timelineOrder: [sourceNode.id],
    });

    sourceNode.toolOutput!.segments[0].text = 'mutated';
    expect(snapshot.timelineNodes.get(sourceNode.id)?.toolOutput?.segments).toEqual([
      { stream: 'stdout', text: 'scan qr\n' },
    ]);
  });

  it('replays buffered background events without duplicating the optimistic query node', () => {
    const baseState = createInitialState();
    const userNode: TimelineNode = {
      id: 'user_local',
      kind: 'message',
      role: 'user',
      text: 'hello',
      ts: 100,
    };
    const snapshot = snapshotConversationState({
      ...baseState,
      requestId: 'req_1',
      streaming: true,
      timelineNodes: new Map([['user_local', userNode]]),
      timelineOrder: ['user_local'],
    });
    const session = createLiveQuerySession({ requestId: 'req_1' });
    session.streaming = true;
    session.abortController = new AbortController();
    session.bufferedEvents = [
      {
        type: 'request.query',
        requestId: 'req_1',
        chatId: 'chat_live',
        message: 'hello',
        timestamp: 101,
      },
      {
        type: 'run.start',
        requestId: 'req_1',
        chatId: 'chat_live',
        runId: 'run_1',
        timestamp: 102,
      },
      {
        type: 'content.start',
        chatId: 'chat_live',
        runId: 'run_1',
        contentId: 'content_1',
        text: 'Hi',
        timestamp: 103,
      },
      {
        type: 'content.delta',
        chatId: 'chat_live',
        runId: 'run_1',
        contentId: 'content_1',
        delta: ' there',
        timestamp: 104,
      },
    ] as AgentEvent[];

    const restored = applyPendingSessionUpdates(snapshot, session);

    expect(restored.chatId).toBe('chat_live');
    expect(restored.runId).toBe('run_1');
    expect(restored.requestId).toBe('req_1');
    expect(restored.timelineOrder).toEqual(['user_local', 'content_0']);
    expect(restored.timelineNodes.get('content_0')).toMatchObject({
      kind: 'content',
      contentId: 'content_1',
      text: 'Hi there',
    });
    expect(restored.timelineNodes.has('user_req_1')).toBe(false);
    expect(restored.events.map((event) => event.type)).toEqual([
      'request.query',
      'run.start',
      'content.start',
      'content.delta',
    ]);
    expect(restored.debugEvents.map((event) => event.type)).toEqual([
      'request.query',
      'run.start',
    ]);
  });

  it('restores run agent identity from buffered events', () => {
    const snapshot = snapshotConversationState({
      ...createInitialState(),
      chatId: 'chat_1',
      runId: '',
      chatAgentById: new Map([['chat_1', 'agent_chat']]),
    });
    const session = createLiveQuerySession({
      requestId: 'req_1',
      chatId: 'chat_1',
      agentKey: 'agent_run',
    });
    session.bufferedEvents = [
      {
        type: 'request.query',
        requestId: 'req_1',
        chatId: 'chat_1',
        agentKey: 'agent_run',
        message: 'hello',
        timestamp: 100,
      },
      {
        type: 'run.start',
        chatId: 'chat_1',
        runId: 'run_1',
        agentKey: 'agent_run',
        timestamp: 101,
      },
      {
        type: 'awaiting.ask',
        chatId: 'chat_1',
        runId: 'run_1',
        awaitingId: 'await_1',
        mode: 'question',
        questions: [{ id: 'q1', type: 'text', question: 'Continue?' }],
        timestamp: 102,
      },
    ] as AgentEvent[];

    const restored = applyPendingSessionUpdates(snapshot, session);

    expect(restored.runId).toBe('run_1');
    expect(restored.runAgentById.get('run_1')).toBe('agent_run');
    expect(restored.currentRunAgentKey).toBe('agent_run');
    expect(restored.activeAwaiting).toMatchObject({
      runId: 'run_1',
      awaitingId: 'await_1',
      agentKey: 'agent_run',
    });
  });

  it('does not let session routing override backend run agent metadata', () => {
    const snapshot = snapshotConversationState(createInitialState());
    const session = createLiveQuerySession({
      requestId: 'req_1',
      agentKey: 'composer-agent',
    });
    session.runId = 'run_1';
    session.bufferedEvents = [
      {
        type: 'run.start',
        chatId: 'chat_1',
        runId: 'run_1',
        agentKey: 'metadata-agent',
        timestamp: 101,
      },
    ] as AgentEvent[];

    const restored = applyPendingSessionUpdates(snapshot, session);

    expect(restored.runAgentById.get('run_1')).toBe('metadata-agent');
    expect(restored.currentRunAgentKey).toBe('metadata-agent');
  });

  it('merges pending raw/debug buffers and clears render caches for restored state', () => {
    const baseState = createInitialState();
    const snapshot = snapshotConversationState({
      ...baseState,
      chatId: 'chat_1',
      runId: 'run_1',
      requestId: 'req_1',
      streaming: true,
      debugLines: ['before'],
    });
    const session = createLiveQuerySession({
      requestId: 'req_1',
      chatId: 'chat_1',
    });
    session.runId = 'run_1';
    session.streaming = false;
    session.abortController = null;
    session.bufferedEvents = [
      {
        type: 'run.complete',
        chatId: 'chat_1',
        runId: 'run_1',
        timestamp: 300,
      },
    ];
    session.bufferedDebugLines = ['before', 'after'];
    session.appliedDebugLineCount = 1;

    const restored = applyPendingSessionUpdates(snapshot, session);
    const updates = buildConversationStateUpdates(restored);

    expect(restored.streaming).toBe(false);
    expect(restored.abortController).toBeNull();
    expect(restored.debugEvents.map((event) => event.type)).toEqual([
      'run.complete',
    ]);
    expect(updates.debugEvents?.map((event) => event.type)).toEqual([
      'run.complete',
    ]);
    expect(restored.debugLines).toEqual(['before', 'after']);
    expect(updates.timelineDomCache).toEqual(new Map());
    expect(updates.renderQueue).toMatchObject({
      scheduled: false,
      stickToBottomRequested: false,
      fullSyncNeeded: false,
    });
  });

  it('preserves usage snapshot across conversation session restore', () => {
    const usageSnapshot = {
      type: 'usage.snapshot',
      chatId: 'chat_1',
      runId: 'run_1',
      contextWindow: {
        maxSize: 128000,
        currentSize: 1326,
        estimatedNextCallSize: 1326,
      },
    } as const;
    const snapshot = snapshotConversationState({
      ...createInitialState(),
      chatId: 'chat_1',
      runId: 'run_1',
      usageSnapshot,
    });
    const updates = buildConversationStateUpdates(snapshot);

    expect(snapshot.usageSnapshot).toBe(usageSnapshot);
    expect(updates.usageSnapshot).toBe(usageSnapshot);
  });

  it('restores pending streamed tool events as debug snapshots', () => {
    const snapshot = snapshotConversationState({
      ...createInitialState(),
      chatId: 'chat_1',
      runId: 'run_1',
      requestId: 'req_1',
      streaming: true,
    });
    const session = createLiveQuerySession({
      requestId: 'req_1',
      chatId: 'chat_1',
    });
    session.runId = 'run_1';
    session.streaming = false;
    session.bufferedEvents = [
      {
        type: 'tool.start',
        toolId: 'tool_1',
        toolName: 'demo.run',
        runId: 'run_1',
        timestamp: 100,
      },
      {
        type: 'tool.args',
        toolId: 'tool_1',
        delta: '{"foo":"bar"}',
        timestamp: 101,
      },
      {
        type: 'tool.end',
        toolId: 'tool_1',
        timestamp: 102,
      },
      {
        type: 'tool.result',
        toolId: 'tool_1',
        result: 'ok',
        timestamp: 103,
      },
    ];

    const restored = applyPendingSessionUpdates(snapshot, session);

    expect(restored.events.map((event) => event.type)).toEqual([
      'tool.start',
      'tool.args',
      'tool.end',
      'tool.result',
    ]);
    expect(restored.debugEvents.map((event) => event.type)).toEqual([
      'tool.snapshot',
      'tool.result',
    ]);
    expect(restored.debugEvents[0]).toMatchObject({
      type: 'tool.snapshot',
      toolId: 'tool_1',
      toolName: 'demo.run',
      runId: 'run_1',
      arguments: '{"foo":"bar"}',
      timestamp: 102,
    });
  });

  it('restores pending streamed text events as debug snapshots', () => {
    const snapshot = snapshotConversationState({
      ...createInitialState(),
      chatId: 'chat_1',
      runId: 'run_1',
      requestId: 'req_1',
      streaming: true,
    });
    const session = createLiveQuerySession({
      requestId: 'req_1',
      chatId: 'chat_1',
    });
    session.runId = 'run_1';
    session.streaming = false;
    session.bufferedEvents = [
      { type: 'content.start', contentId: 'content_1', text: 'A', runId: 'run_1' },
      { type: 'content.delta', contentId: 'content_1', delta: 'B' },
      { type: 'content.end', contentId: 'content_1', timestamp: 102 },
      { type: 'reasoning.start', reasoningId: 'reasoning_1', reasoningLabel: 'Think', text: 'C', runId: 'run_1' },
      { type: 'reasoning.delta', reasoningId: 'reasoning_1', delta: 'D' },
      { type: 'reasoning.end', reasoningId: 'reasoning_1', timestamp: 103 },
      { type: 'planning.start', planningId: 'planning_1', planningLabel: 'Plan', text: 'E', runId: 'run_1' },
      { type: 'planning.delta', planningId: 'planning_1', delta: 'F' },
      { type: 'planning.end', planningId: 'planning_1', timestamp: 104 },
    ];

    const restored = applyPendingSessionUpdates(snapshot, session);

    expect(restored.debugEvents.map((event) => event.type)).toEqual([
      'content.snapshot',
      'reasoning.snapshot',
      'planning.snapshot',
    ]);
    expect(restored.debugEvents).toEqual([
      expect.objectContaining({ type: 'content.snapshot', text: 'AB' }),
      expect.objectContaining({ type: 'reasoning.snapshot', reasoningLabel: 'Think', text: 'CD' }),
      expect.objectContaining({ type: 'planning.snapshot', planningLabel: 'Plan', text: 'EF' }),
    ]);
  });

  it('marks applied counts from buffer lengths to prevent double-replay when events are truncated', () => {
    const session = createLiveQuerySession({
      requestId: 'req_1',
      chatId: 'chat_1',
    });
    session.bufferedEvents = [
      { type: 'request.query', requestId: 'req_1', chatId: 'chat_1' },
      { type: 'run.start', requestId: 'req_1', chatId: 'chat_1', runId: 'run_1' },
      { type: 'content.delta', requestId: 'req_1', chatId: 'chat_1', runId: 'run_1', contentId: 'content_1', delta: ' later' },
    ];
    session.bufferedDebugLines = ['line-1', 'line-2', 'line-3'];
    session.snapshot = {
      ...snapshotConversationState(createInitialState()),
      chatId: 'chat_1',
      requestId: 'req_1',
      // Simulate truncated events (snapshot has fewer events than buffer)
      events: session.bufferedEvents.slice(0, 2),
      debugLines: session.bufferedDebugLines.slice(0, 2),
    };

    markSessionSnapshotApplied(session);

    // Should use buffer lengths, not snapshot lengths, to prevent
    // double-replaying events when state.events is truncated by MAX_EVENTS
    expect(session.appliedEventCount).toBe(3);
    expect(session.appliedDebugLineCount).toBe(3);
  });
});
