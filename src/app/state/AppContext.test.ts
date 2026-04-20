import type { WorkerConversationRow } from '@/app/state/types';
import { appReducer, createInitialState } from '@/app/state/AppContext';
import * as transportModeModule from '@/features/transport/lib/transportMode';

describe('appReducer conversation reset behavior', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => '',
      },
    });
    if (originalWindow) {
      (globalThis as unknown as { window?: Window & typeof globalThis }).window =
        {
          ...originalWindow,
          location: {
            ...originalWindow.location,
            pathname: '/',
          },
        };
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  afterEach(() => {
    if (originalWindow) {
      (globalThis as unknown as { window?: Window & typeof globalThis }).window =
        originalWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  it('uses the app bridge token as the initial access token in app mode', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => 'web-token',
      },
    });
    (globalThis as unknown as { window?: Window & typeof globalThis }).window =
      {
        location: {
          pathname: '/appagent',
        },
        sessionStorage: {
          getItem: (key: string) =>
            key === 'agent-webclient.appAccessToken' ? 'app-token' : null,
          setItem: () => undefined,
          removeItem: () => undefined,
        },
      } as Window & typeof globalThis;

    const state = createInitialState();

    expect(state.accessToken).toBe('app-token');
  });

  it('hydrates the initial theme from the html attribute when no stored value exists', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => '',
      },
    });
    (globalThis as unknown as { window?: Window & typeof globalThis }).window =
      {
        location: {
          pathname: '/',
          search: '',
        },
      } as Window & typeof globalThis;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        documentElement: {
          getAttribute: (key: string) =>
            key === 'data-theme' ? 'dark' : null,
        },
      },
    });

    const state = createInitialState();

    expect(state.themeMode).toBe('dark');
  });

  it('hydrates the initial theme from hostTheme when embedded in desktop', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => 'light',
      },
    });
    (globalThis as unknown as { window?: Window & typeof globalThis }).window =
      {
        location: {
          pathname: '/appagent',
          search: '?desktopApp=1&hostTheme=dark',
        },
      } as Window & typeof globalThis;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        documentElement: {
          getAttribute: () => 'light',
        },
      },
    });

    const state = createInitialState();

    expect(state.themeMode).toBe('dark');
  });

  it('hydrates the initial transport mode from localStorage', () => {
    jest
      .spyOn(transportModeModule, 'readStoredTransportMode')
      .mockReturnValue('sse');

    const state = createInitialState();

    expect(state.transportMode).toBe('sse');
    expect(state.wsStatus).toBe('disconnected');
    expect(state.wsErrorMessage).toBe('');
  });

  it('defaults the initial transport mode to ws when nothing is stored', () => {
    jest
      .spyOn(transportModeModule, 'readStoredTransportMode')
      .mockReturnValue(null);

    const state = createInitialState();

    expect(state.transportMode).toBe('ws');
  });

  it('opens the left drawer by default on desktop widths', () => {
    (globalThis as unknown as { window?: Window & typeof globalThis }).window =
      {
        location: {
          pathname: '/',
          search: '',
        },
        innerWidth: 1440,
      } as Window & typeof globalThis;

    const state = createInitialState();

    expect(state.layoutMode).toBe('desktop-fixed');
    expect(state.leftDrawerOpen).toBe(true);
  });

  it('keeps the left drawer closed by default on mobile widths', () => {
    (globalThis as unknown as { window?: Window & typeof globalThis }).window =
      {
        location: {
          pathname: '/',
          search: '',
        },
        innerWidth: 900,
      } as Window & typeof globalThis;

    const state = createInitialState();

    expect(state.layoutMode).toBe('mobile-drawer');
    expect(state.leftDrawerOpen).toBe(false);
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

  it('normalizes theme updates through the reducer', () => {
    const baseState = createInitialState();

    const next = appReducer(baseState, {
      type: 'SET_THEME_MODE',
      themeMode: 'dark',
    });

    expect(next.themeMode).toBe('dark');
  });

  it('updates transport mode and ws status through the reducer', () => {
    const baseState = createInitialState();

    const nextMode = appReducer(baseState, {
      type: 'SET_TRANSPORT_MODE',
      mode: 'sse',
    });
    const nextStatus = appReducer(nextMode, {
      type: 'SET_WS_STATUS',
      status: 'connected',
    });

    expect(nextMode.transportMode).toBe('sse');
    expect(nextStatus.wsStatus).toBe('connected');
    expect(nextStatus.wsErrorMessage).toBe('');
  });

  it('stores and clears websocket error details through the reducer', () => {
    const baseState = createInitialState();

    const errored = appReducer(baseState, {
      type: 'SET_WS_ERROR_MESSAGE',
      message: 'WebSocket 握手失败，请检查 Access Token 是否有效。',
    });
    const connected = appReducer(
      {
        ...errored,
        wsStatus: 'error',
      },
      {
        type: 'SET_WS_STATUS',
        status: 'connected',
      },
    );
    const resetByToken = appReducer(errored, {
      type: 'SET_ACCESS_TOKEN',
      token: 'token_1',
    });
    const resetByMode = appReducer(
      {
        ...errored,
        wsStatus: 'error',
      },
      {
        type: 'SET_TRANSPORT_MODE',
        mode: 'sse',
      },
    );

    expect(errored.wsErrorMessage).toBe(
      'WebSocket 握手失败，请检查 Access Token 是否有效。',
    );
    expect(connected.wsErrorMessage).toBe('');
    expect(resetByToken.wsErrorMessage).toBe('');
    expect(resetByMode.wsErrorMessage).toBe('');
    expect(resetByMode.wsStatus).toBe('disconnected');
    expect(resetByMode.transportMode).toBe('sse');
  });

  it('resets voice chat runtime state and input mode during conversation reset', () => {
    const baseState = createInitialState();
    const state = {
      ...baseState,
      inputMode: 'voice' as const,
      activeAwaiting: {
        key: 'run_1#await_1',
        awaitingId: 'await_1',
        runId: 'run_1',
        timeout: 30,
        mode: 'question' as const,
        questions: [],
      },
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
    expect(next.activeAwaiting).toBeNull();
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

  it('patches active awaiting runtime state without replacing the session', () => {
    const baseState = createInitialState();
    const state = {
      ...baseState,
      activeAwaiting: {
        key: 'run_1#await_1',
        awaitingId: 'await_1',
        runId: 'run_1',
        timeout: 30,
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
        loading: true,
        loadError: '',
        viewportHtml: '',
      },
    };

    const next = appReducer(state, {
      type: 'PATCH_ACTIVE_AWAITING',
      patch: {
        loading: false,
        viewportHtml: '<html><body>ready</body></html>',
      },
    });

    expect(next.activeAwaiting).toMatchObject({
      key: 'run_1#await_1',
      viewportKey: 'leave_form',
      loading: false,
      viewportHtml: '<html><body>ready</body></html>',
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
