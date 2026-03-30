import { createInitialState } from '../context/AppContext';
import type { AgentEvent, TimelineNode } from '../context/types';
import {
  applyPendingSessionUpdates,
  buildConversationStateUpdates,
  createLiveQuerySession,
  markSessionSnapshotApplied,
  snapshotConversationState,
} from './conversationSession';

describe('conversation session restore', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => '',
      },
    });
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
  });

  it('merges pending raw/debug buffers and clears render caches for restored state', () => {
    const baseState = createInitialState();
    const rawBefore = {
      receivedAt: 100,
      rawFrame: 'event: start',
      parsedEventName: 'run.start',
    };
    const rawAfter = {
      receivedAt: 200,
      rawFrame: 'event: end',
      parsedEventName: 'run.complete',
    };
    const snapshot = snapshotConversationState({
      ...baseState,
      chatId: 'chat_1',
      runId: 'run_1',
      requestId: 'req_1',
      streaming: true,
      debugLines: ['before'],
      rawSseEntries: [rawBefore],
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
    session.bufferedRawSseEntries = [rawBefore, rawAfter];
    session.bufferedDebugLines = ['before', 'after'];
    session.appliedRawSseEntryCount = 1;
    session.appliedDebugLineCount = 1;

    const restored = applyPendingSessionUpdates(snapshot, session);
    const updates = buildConversationStateUpdates(restored);

    expect(restored.streaming).toBe(false);
    expect(restored.abortController).toBeNull();
    expect(restored.rawSseEntries).toEqual([rawBefore, rawAfter]);
    expect(restored.debugLines).toEqual(['before', 'after']);
    expect(updates.timelineDomCache).toEqual(new Map());
    expect(updates.renderQueue).toMatchObject({
      scheduled: false,
      stickToBottomRequested: false,
      fullSyncNeeded: false,
    });
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
    session.bufferedRawSseEntries = [
      { receivedAt: 1, rawFrame: 'frame-1' },
      { receivedAt: 2, rawFrame: 'frame-2' },
    ];
    session.bufferedDebugLines = ['line-1', 'line-2', 'line-3'];
    session.snapshot = {
      ...snapshotConversationState(createInitialState()),
      chatId: 'chat_1',
      requestId: 'req_1',
      // Simulate truncated events (snapshot has fewer events than buffer)
      events: session.bufferedEvents.slice(0, 2),
      rawSseEntries: session.bufferedRawSseEntries.slice(0, 1),
      debugLines: session.bufferedDebugLines.slice(0, 2),
    };

    markSessionSnapshotApplied(session);

    // Should use buffer lengths, not snapshot lengths, to prevent
    // double-replaying events when state.events is truncated by MAX_EVENTS
    expect(session.appliedEventCount).toBe(3);
    expect(session.appliedRawSseEntryCount).toBe(2);
    expect(session.appliedDebugLineCount).toBe(3);
  });
});
