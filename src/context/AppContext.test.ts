import type { WorkerConversationRow } from './types';
import { appReducer, createInitialState } from './AppContext';

describe('appReducer conversation reset behavior', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => '',
      },
    });
  });

  it('preserves worker conversation context for RESET_ACTIVE_CONVERSATION', () => {
    const baseState = createInitialState();
    const workerChats: WorkerConversationRow[] = [
      {
        chatId: 'chat_worker_1',
        chatName: '与员工张三的对话',
        updatedAt: 123,
        lastRunId: 'run_1',
        lastRunContent: 'hello',
      },
    ];

    const state = {
      ...baseState,
      chatId: 'chat_worker_1',
      workerSelectionKey: 'agent:worker_a',
      runId: 'run_live_1',
      requestId: 'req_live_1',
      streaming: true,
      abortController: new AbortController(),
      workerRelatedChats: workerChats,
      workerChatPanelCollapsed: false,
      timelineOrder: ['user_1'],
    };

    const next = appReducer(state, { type: 'RESET_ACTIVE_CONVERSATION' });

    expect(next.chatId).toBe('chat_worker_1');
    expect(next.workerSelectionKey).toBe('agent:worker_a');
    expect(next.runId).toBe('');
    expect(next.requestId).toBe('');
    expect(next.streaming).toBe(false);
    expect(next.abortController).toBeNull();
    expect(next.workerRelatedChats).toEqual(workerChats);
    expect(next.workerChatPanelCollapsed).toBe(false);
    expect(next.timelineOrder).toEqual([]);
  });

  it('upserts chat summaries without dropping existing metadata', () => {
    const baseState = createInitialState();
    const state = {
      ...baseState,
      chats: [
        {
          chatId: 'chat_1',
          chatName: 'Original chat',
          firstAgentName: 'Alice',
          firstAgentKey: 'agent-alice',
          agentKey: 'agent-alice',
        },
      ],
    };

    const next = appReducer(state, {
      type: 'UPSERT_CHAT',
      chat: {
        chatId: 'chat_1',
        lastRunId: 'run_2',
        lastRunContent: 'Latest answer',
      },
    });

    expect(next.chats[0]).toMatchObject({
      chatId: 'chat_1',
      chatName: 'Original chat',
      firstAgentName: 'Alice',
      firstAgentKey: 'agent-alice',
      agentKey: 'agent-alice',
      lastRunId: 'run_2',
      lastRunContent: 'Latest answer',
    });
  });

  it('manages pending steer queue lifecycle', () => {
    const baseState = createInitialState();

    const queued = appReducer(baseState, {
      type: 'ENQUEUE_PENDING_STEER',
      steer: {
        steerId: 'steer_1',
        message: '改成北京',
        requestId: 'req_1',
        runId: 'run_1',
        createdAt: 100,
      },
    });
    const removed = appReducer(queued, {
      type: 'REMOVE_PENDING_STEER',
      steerId: 'steer_1',
    });

    expect(queued.pendingSteers).toHaveLength(1);
    expect(removed.pendingSteers).toEqual([]);
  });

  it('resets voice chat runtime state and input mode during conversation reset', () => {
    const baseState = createInitialState();
    const state = {
      ...baseState,
      inputMode: 'voice' as const,
      voiceChat: {
        ...baseState.voiceChat,
        status: 'speaking' as const,
        sessionActive: true,
        partialUserText: '你好',
        partialAssistantText: '你好，我在。',
        activeAssistantContentId: 'content_voice_1',
        activeRequestId: 'req_voice_1',
        activeTtsTaskId: 'tts_voice_1',
        ttsCommitted: true,
        clientGateCustomized: true,
        clientGate: {
          enabled: false,
          rmsThreshold: 0.015,
          openHoldMs: 150,
          closeHoldMs: 600,
          preRollMs: 180,
        },
        currentAgentKey: 'agent-alice',
        currentAgentName: 'Alice',
      },
    };

    const next = appReducer(state, { type: 'RESET_CONVERSATION' });

    expect(next.inputMode).toBe('text');
    expect(next.voiceChat).toMatchObject({
      status: 'idle',
      sessionActive: false,
      partialUserText: '',
      partialAssistantText: '',
      activeAssistantContentId: '',
      activeRequestId: '',
      activeTtsTaskId: '',
      ttsCommitted: false,
      clientGateCustomized: true,
      clientGate: {
        enabled: false,
        rmsThreshold: 0.015,
        openHoldMs: 150,
        closeHoldMs: 600,
        preRollMs: 180,
      },
      currentAgentKey: '',
      currentAgentName: '',
    });
  });

  it('patches content tts voice blocks without clobbering the latest streamed text or segments', () => {
    const baseState = createInitialState();
    const contentNode = {
      id: 'content_1',
      kind: 'content' as const,
      contentId: 'content_1',
      text: '```tts-voice\nhello',
      segments: [
        {
          kind: 'ttsVoice' as const,
          signature: 'content_1::tts-voice::0',
          text: 'hello',
          closed: false,
          startOffset: 0,
        },
      ],
      ts: 123,
    };
    const state = {
      ...baseState,
      timelineNodes: new Map([['content_1', contentNode]]),
      contentNodeById: new Map([['content_1', 'content_1']]),
    };

    const next = appReducer(state, {
      type: 'PATCH_CONTENT_TTS_VOICE_BLOCK',
      nodeId: 'content_1',
      signature: 'content_1::tts-voice::0',
      patch: {
        text: 'hello',
        closed: false,
        status: 'connecting',
        error: '',
      },
    });

    expect(next.timelineNodes.get('content_1')).toMatchObject({
      text: '```tts-voice\nhello',
      segments: [
        {
          kind: 'ttsVoice',
          signature: 'content_1::tts-voice::0',
          text: 'hello',
          closed: false,
          startOffset: 0,
        },
      ],
      ttsVoiceBlocks: {
        'content_1::tts-voice::0': expect.objectContaining({
          signature: 'content_1::tts-voice::0',
          text: 'hello',
          closed: false,
          status: 'connecting',
        }),
      },
    });
  });

  it('opens, updates, and closes the command modal state', () => {
    const baseState = createInitialState();

    const opened = appReducer(baseState, {
      type: 'OPEN_COMMAND_MODAL',
      modal: {
        type: 'switch',
        searchText: 'alice',
      },
    });
    const patched = appReducer(opened, {
      type: 'PATCH_COMMAND_MODAL',
      modal: {
        activeIndex: 2,
        scope: 'team',
      },
    });
    const closed = appReducer(patched, {
      type: 'CLOSE_COMMAND_MODAL',
    });

    expect(opened.commandModal).toMatchObject({
      open: true,
      type: 'switch',
      searchText: 'alice',
      activeIndex: 0,
      scope: 'all',
      focusArea: 'search',
    });
    expect(patched.commandModal).toMatchObject({
      open: true,
      type: 'switch',
      searchText: 'alice',
      activeIndex: 2,
      scope: 'team',
      focusArea: 'search',
    });
    expect(closed.commandModal).toMatchObject({
      open: false,
      type: null,
      searchText: '',
      activeIndex: 0,
      scope: 'all',
      focusArea: 'search',
    });
  });

  it('shows, tracks timer, and hides command status overlay', () => {
    const baseState = createInitialState();

    const shown = appReducer(baseState, {
      type: 'SHOW_COMMAND_STATUS_OVERLAY',
      commandType: 'remember',
      phase: 'pending',
      text: '正在记忆中...',
    });
    const timed = appReducer(shown, {
      type: 'SET_COMMAND_STATUS_OVERLAY_TIMER',
      timer: 321,
    });
    const hidden = appReducer(timed, {
      type: 'HIDE_COMMAND_STATUS_OVERLAY',
    });

    expect(shown.commandStatusOverlay).toMatchObject({
      visible: true,
      commandType: 'remember',
      phase: 'pending',
      text: '正在记忆中...',
      timer: null,
    });
    expect(timed.commandStatusOverlay.timer).toBe(321);
    expect(hidden.commandStatusOverlay).toMatchObject({
      visible: false,
      commandType: null,
      text: '',
      timer: null,
    });
  });

  it('clears command status overlay during conversation reset', () => {
    const baseState = createInitialState();
    const state = {
      ...baseState,
      commandStatusOverlay: {
        visible: true,
        commandType: 'learn' as const,
        phase: 'error' as const,
        text: '学习失败',
        timer: 456,
      },
    };

    const next = appReducer(state, { type: 'RESET_CONVERSATION' });

    expect(next.commandStatusOverlay).toMatchObject({
      visible: false,
      commandType: null,
      text: '',
      timer: null,
    });
  });
});
