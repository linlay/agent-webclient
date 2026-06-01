import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialState } from '@/app/state/state';
import type { Agent, Chat, Team, WorkerRow } from '@/app/state/types';
import {
  createReplayState,
  getAutoReadTriggerKey,
  normalizeChatArtifactItems,
  normalizeStartNewConversationDetail,
  replayEvent,
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
  localStorage?: {
    getItem: jest.Mock;
    setItem: jest.Mock;
    removeItem: jest.Mock;
  };
  CustomEvent?: typeof CustomEvent;
};

describe('replayEvent tool migration', () => {
  const originalWindow = globalWithBrowserApis.window;
  const originalLocalStorage = globalWithBrowserApis.localStorage;
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
    globalWithBrowserApis.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
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
    if (originalLocalStorage) {
      globalWithBrowserApis.localStorage = originalLocalStorage;
    } else {
      delete globalWithBrowserApis.localStorage;
    }
    if (originalCustomEvent) {
      globalWithBrowserApis.CustomEvent = originalCustomEvent;
    } else {
      delete globalWithBrowserApis.CustomEvent;
    }
  });

  function renderChatActions(state = createInitialState()) {
    const dispatch = jest.fn();
    useAppContext.mockReturnValue({
      state,
      dispatch,
      stateRef: { current: state },
      querySessionsRef: { current: new Map() },
      chatQuerySessionIndexRef: { current: new Map() },
      activeQuerySessionRequestIdRef: { current: '' },
    });

    let actions: ReturnType<typeof useChatActions> | null = null;
    const Harness = () => {
      actions = useChatActions();
      return null;
    };
    renderToStaticMarkup(React.createElement(Harness));

    return { actions, dispatch };
  }

  function createWorkerConversationState(options: {
    hasHistory?: boolean;
    latestChat?: Partial<Chat>;
    olderChat?: Partial<Chat>;
    latestChatId?: string;
  } = {}) {
    const hasHistory = options.hasHistory ?? true;
    const latestChatId = options.latestChatId ?? (hasHistory ? 'chat_latest' : '');
    const state = createInitialState();
    const worker: WorkerRow = {
      key: 'agent:worker_a',
      type: 'agent',
      sourceId: 'worker_a',
      displayName: 'Alpha Agent',
      role: 'Builder',
      teamAgentLabels: [],
      latestChatId,
      latestRunId: hasHistory ? 'run_latest' : '',
      latestUpdatedAt: hasHistory ? 2000 : 0,
      latestChatName: hasHistory ? 'Latest chat' : '',
      latestRunContent: hasHistory ? 'Latest reply' : '',
      hasHistory,
      latestRunSortValue: hasHistory ? 2000 : 0,
      searchText: 'alpha agent worker_a',
    };
    const olderChat: Chat = {
      chatId: 'chat_older',
      chatName: 'Older chat',
      updatedAt: 1000,
      agentKey: 'worker_a',
      firstAgentKey: 'worker_a',
      lastRunId: 'run_older',
      lastRunContent: 'Older reply',
      read: { isRead: true },
      ...options.olderChat,
    };
    const latestChat: Chat = {
      chatId: latestChatId || 'chat_latest',
      chatName: 'Latest chat',
      updatedAt: 2000,
      agentKey: 'worker_a',
      firstAgentKey: 'worker_a',
      lastRunId: 'run_latest',
      lastRunContent: 'Latest reply',
      read: { isRead: true },
      ...options.latestChat,
    };

    state.conversationMode = 'worker';
    state.workerSelectionKey = worker.key;
    state.workerRows = [worker];
    state.workerIndexByKey = new Map([[worker.key, worker]]);
    state.chats = hasHistory ? [olderChat, latestChat] : [];
    return state;
  }

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

  it('keeps a blank conversation from being overwritten by an in-flight chat load', async () => {
    const state = createInitialState();
    const dispatch = jest.fn();
    useAppContext.mockReturnValue({
      state,
      dispatch,
      stateRef: { current: state },
      querySessionsRef: { current: new Map() },
      chatQuerySessionIndexRef: { current: new Map() },
      activeQuerySessionRequestIdRef: { current: '' },
    });

    let resolveChat!: (value: { data: Record<string, unknown> }) => void;
    getChat.mockReturnValue(
      new Promise((resolve) => {
        resolveChat = resolve;
      }),
    );

    let actions: ReturnType<typeof useChatActions> | null = null;
    const Harness = () => {
      actions = useChatActions();
      return null;
    };
    renderToStaticMarkup(React.createElement(Harness));

    const loadPromise = actions?.loadChat('chat-stale') || Promise.resolve();
    expect(getChat).toHaveBeenCalledWith('chat-stale', false);

    actions?.activateBlankConversation({
      preserveWorkerContext: true,
      focusComposerOnComplete: true,
    });
    resolveChat({
      data: {
        events: [
          {
            type: 'request.query',
            requestId: 'req_stale',
            chatId: 'chat-stale',
            message: 'stale',
            timestamp: 100,
          },
        ],
        runs: [],
      },
    });
    await loadPromise;

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CHAT_ID', chatId: '' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESET_ACTIVE_CONVERSATION' });
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'BATCH_UPDATE' }),
    );
  });

  it('hydrates usage snapshot from /api/chat top-level usage without current call usage', async () => {
    const { actions, dispatch } = renderChatActions();
    getChat.mockResolvedValue({
      data: {
        events: [],
        activeRun: {
          runId: 'run_active',
          modelKey: 'deepseek-chat',
          usage: {
            promptTokens: 30,
            completionTokens: 12,
            totalTokens: 42,
            promptTokensDetails: { cacheHitTokens: 10, cacheMissTokens: 20 },
            promptCacheHitTokens: 999,
            promptCacheMissTokens: 999,
            llmChatCompletionCount: 2,
            toolCallCount: 3,
          },
        },
        runs: [],
        usage: {
          promptTokens: 100,
          completionTokens: 40,
          totalTokens: 140,
          promptTokensDetails: { cacheHitTokens: 35, cacheMissTokens: 65 },
          completionTokensDetails: { reasoningTokens: 9 },
          estimatedCost: {
            currency: 'CNY',
            inputCacheHit: 0.00007168,
            inputCacheMiss: 0.000086,
            output: 0.000122,
            total: 0.00027968,
          },
          promptCacheHitTokens: 999,
          promptCacheMissTokens: 999,
          llmChatCompletionCount: 5,
          toolCallCount: 8,
        },
        contextWindow: {
          maxSize: 128000,
          currentSize: 64000,
          estimatedNextCallSize: 8000,
        },
      },
    });

    await actions?.loadChat('chat-usage');

    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_USAGE_SNAPSHOT',
      snapshot: {
        type: 'usage.snapshot',
        chatId: 'chat-usage',
        runId: 'run_active',
        model: { key: 'deepseek-chat' },
        contextWindow: {
          maxSize: 128000,
          currentSize: 64000,
          estimatedNextCallSize: 8000,
        },
        usage: {
          current: {},
          run: {
            promptTokens: 30,
            completionTokens: 12,
            totalTokens: 42,
            promptTokensDetails: { cacheHitTokens: 10, cacheMissTokens: 20 },
            llmChatCompletionCount: 2,
            toolCallCount: 3,
          },
          chat: {
            promptTokens: 100,
            completionTokens: 40,
            totalTokens: 140,
            promptTokensDetails: { cacheHitTokens: 35, cacheMissTokens: 65 },
            completionTokensDetails: { reasoningTokens: 9 },
            estimatedCost: {
              currency: 'CNY',
              inputCacheHit: 0.00007168,
              inputCacheMiss: 0.000086,
              output: 0.000122,
              total: 0.00027968,
            },
            llmChatCompletionCount: 5,
            toolCallCount: 8,
          },
        },
      },
    });
    const usageAction = dispatch.mock.calls.find(([action]) => action.type === 'SET_USAGE_SNAPSHOT')?.[0];
    expect(usageAction.snapshot.usage.current).toEqual({});
  });

  it('hydrates context window from the latest usage snapshot event when switching chats', async () => {
    const { actions, dispatch } = renderChatActions();
    getChat.mockResolvedValue({
      data: {
        events: [
          {
            type: 'usage.snapshot',
            chatId: 'chat-event-usage',
            runId: 'run_latest',
            model: { key: 'minimax' },
            contextWindow: {
              maxSize: 128000,
              currentSize: 13157,
              estimatedNextCallSize: 13367,
            },
            usage: {
              current: {
                promptTokens: 13157,
                completionTokens: 210,
                totalTokens: 13367,
                toolCallCount: 2,
              },
              run: {
                promptTokens: 13157,
                completionTokens: 210,
                totalTokens: 13367,
                llmChatCompletionCount: 1,
                toolCallCount: 2,
              },
              chat: {
                promptTokens: 117392,
                completionTokens: 11205,
                totalTokens: 128597,
                llmChatCompletionCount: 12,
                toolCallCount: 15,
              },
            },
          },
        ],
        runs: [
          {
            runId: 'run_latest',
            modelKey: 'minimax',
            usage: {
              promptTokens: 6400,
              completionTokens: 200,
              totalTokens: 6600,
              llmChatCompletionCount: 1,
              toolCallCount: 4,
            },
          },
        ],
        usage: {
          promptTokens: 117392,
          completionTokens: 11205,
          totalTokens: 128597,
          llmChatCompletionCount: 12,
          toolCallCount: 15,
        },
      },
    });

    await actions?.loadChat('chat-event-usage');

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SET_USAGE_SNAPSHOT',
        snapshot: expect.objectContaining({
          runId: 'run_latest',
          model: { key: 'minimax' },
          contextWindow: {
            maxSize: 128000,
            currentSize: 13157,
            estimatedNextCallSize: 13367,
          },
        }),
      }),
    );
  });

  it('hydrates usage snapshot from /api/chat nested lastRun and chat usage', async () => {
    const { actions, dispatch } = renderChatActions();
    getChat.mockResolvedValue({
      data: {
        events: [
          { seq: 1, type: 'chat.start', chatId: 'chat-nested-usage' },
          {
            seq: 5,
            type: 'usage.snapshot',
            runId: 'run_from_event',
            chatId: 'chat-nested-usage',
            model: { key: 'deepseek-chat' },
            contextWindow: {
              currentSize: 6252,
              estimatedNextCallSize: 6374,
              maxSize: 128000,
            },
            usage: {
              current: {
                promptTokens: 6252,
                completionTokens: 122,
                totalTokens: 6374,
                completionTokensDetails: {
                  reasoningTokens: 85,
                },
              },
            },
          },
        ],
        runs: [
          {
            runId: 'run_from_runs',
            usage: {
              promptTokens: 1,
              completionTokens: 1,
              totalTokens: 2,
            },
          },
        ],
        usage: {
          lastRun: {
            promptTokens: 6252,
            completionTokens: 122,
            totalTokens: 6374,
            completionTokensDetails: {
              reasoningTokens: 85,
            },
            llmChatCompletionCount: 1,
            toolCallCount: 2,
          },
          chat: {
            promptTokens: 6252,
            completionTokens: 122,
            totalTokens: 6374,
            completionTokensDetails: {
              reasoningTokens: 85,
            },
            llmChatCompletionCount: 1,
            toolCallCount: 3,
          },
        },
      },
    });

    await actions?.loadChat('chat-nested-usage');

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SET_USAGE_SNAPSHOT',
        snapshot: expect.objectContaining({
          type: 'usage.snapshot',
          chatId: 'chat-nested-usage',
          runId: 'run_from_runs',
          model: { key: 'deepseek-chat' },
          contextWindow: {
            maxSize: 128000,
            currentSize: 6252,
            estimatedNextCallSize: 6374,
          },
          usage: {
            current: {
              promptTokens: 6252,
              completionTokens: 122,
              totalTokens: 6374,
              completionTokensDetails: {
                reasoningTokens: 85,
              },
            },
            run: {
              promptTokens: 6252,
              completionTokens: 122,
              totalTokens: 6374,
              completionTokensDetails: {
                reasoningTokens: 85,
              },
              llmChatCompletionCount: 1,
              toolCallCount: 2,
            },
            chat: {
              promptTokens: 6252,
              completionTokens: 122,
              totalTokens: 6374,
              completionTokensDetails: {
                reasoningTokens: 85,
              },
              llmChatCompletionCount: 1,
              toolCallCount: 3,
            },
          },
        }),
      }),
    );
  });

  it('applies latest compact estimate over older usage snapshot when switching chats', async () => {
    const { actions, dispatch } = renderChatActions();
    getChat.mockResolvedValue({
      data: {
        events: [
          {
            type: 'context.compact.complete',
            chatId: 'chat-compacted',
            compactId: 'compact-1',
            timestamp: 200,
            postCompactEstimatedTokens: 5396,
          },
          {
            type: 'usage.snapshot',
            chatId: 'chat-compacted',
            runId: 'run_before_compact',
            timestamp: 100,
            model: { key: 'minimax' },
            contextWindow: {
              maxSize: 128000,
              currentSize: 13157,
              estimatedNextCallSize: 13367,
            },
            usage: {
              run: {
                promptTokens: 13157,
                completionTokens: 210,
                totalTokens: 13367,
                llmChatCompletionCount: 1,
              },
            },
          },
        ],
        runs: [],
        usage: {
          promptTokens: 117392,
          completionTokens: 11205,
          totalTokens: 128597,
          llmChatCompletionCount: 12,
        },
      },
    });

    await actions?.loadChat('chat-compacted');

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SET_USAGE_SNAPSHOT',
        snapshot: expect.objectContaining({
          contextWindow: {
            maxSize: 128000,
            currentSize: 5396,
            estimatedNextCallSize: 5396,
          },
        }),
      }),
    );
  });

  it('skips loaded chat usage snapshots when usage is not meaningful', async () => {
    const { actions, dispatch } = renderChatActions();
    getChat.mockResolvedValue({
      data: {
        events: [],
        runs: [],
        usage: {
          totalTokens: 0,
          llmChatCompletionCount: 0,
          toolCallCount: 0,
        },
      },
    });

    await actions?.loadChat('chat-empty-usage');

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_USAGE_SNAPSHOT' }),
    );
  });

  it('uses the latest run usage when activeRun has no meaningful usage', async () => {
    const { actions, dispatch } = renderChatActions();
    getChat.mockResolvedValue({
      data: {
        events: [],
        activeRun: {
          runId: 'run_active',
          modelKey: 'active-model',
          usage: { totalTokens: 0, llmChatCompletionCount: 0 },
        },
        runs: [
          {
            runId: 'run_old',
            modelKey: 'old-model',
            usage: { totalTokens: 10, llmChatCompletionCount: 1 },
          },
          {
            runId: 'run_latest',
            model: { key: 'latest-model' },
            usage: {
              promptTokens: 70,
              completionTokens: 20,
              totalTokens: 90,
              llmChatCompletionCount: 3,
              toolCallCount: 6,
            },
          },
        ],
        usage: {
          promptTokens: 200,
          completionTokens: 80,
          totalTokens: 280,
          llmChatCompletionCount: 4,
          toolCallCount: 9,
        },
      },
    });

    await actions?.loadChat('chat-run-usage');

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SET_USAGE_SNAPSHOT',
        snapshot: expect.objectContaining({
          runId: 'run_active',
          model: { key: 'active-model' },
          usage: expect.objectContaining({
            run: {
              promptTokens: 70,
              completionTokens: 20,
              totalTokens: 90,
              llmChatCompletionCount: 3,
              toolCallCount: 6,
            },
          }),
        }),
      }),
    );
  });

  it('hydrates zero-token usage snapshots when tool calls are present', async () => {
    const { actions, dispatch } = renderChatActions();
    getChat.mockResolvedValue({
      data: {
        events: [],
        runs: [],
        usage: {
          totalTokens: 0,
          llmChatCompletionCount: 0,
          toolCallCount: 2,
        },
      },
    });

    await actions?.loadChat('chat-tool-usage');

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SET_USAGE_SNAPSHOT',
        snapshot: expect.objectContaining({
          usage: {
            current: {},
            chat: {
              totalTokens: 0,
              llmChatCompletionCount: 0,
              toolCallCount: 2,
            },
          },
        }),
      }),
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

  it('loads the latest worker chat when preferNewChat sees pending awaiting', async () => {
    const state = createWorkerConversationState({
      latestChat: {
        hasPendingAwaiting: true,
        read: { isRead: true },
      },
    });
    const { actions, dispatch } = renderChatActions(state);
    getChat.mockResolvedValue({ data: { events: [], runs: [] } });

    await actions?.selectWorkerConversation('agent:worker_a', {
      focusComposerOnComplete: true,
      preferNewChat: true,
    });

    expect(getChat).toHaveBeenCalledWith('chat_latest', false);
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'SET_CHAT_ID', chatId: '' });
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'RESET_ACTIVE_CONVERSATION' });
  });

  it('loads the latest worker chat when preferNewChat sees unread state', async () => {
    const state = createWorkerConversationState({
      latestChat: {
        read: { isRead: false },
      },
    });
    const { actions, dispatch } = renderChatActions(state);
    getChat.mockResolvedValue({ data: { events: [], runs: [] } });

    await actions?.selectWorkerConversation('agent:worker_a', {
      focusComposerOnComplete: true,
      preferNewChat: true,
    });

    expect(getChat).toHaveBeenCalledWith('chat_latest', false);
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'SET_CHAT_ID', chatId: '' });
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'RESET_ACTIVE_CONVERSATION' });
  });

  it('starts a blank worker chat when preferNewChat latest chat is read with no awaiting', async () => {
    const state = createWorkerConversationState({
      olderChat: {
        read: { isRead: false },
      },
      latestChat: {
        read: { isRead: true },
        hasPendingAwaiting: false,
      },
    });
    const { actions, dispatch } = renderChatActions(state);

    await actions?.selectWorkerConversation('agent:worker_a', {
      focusComposerOnComplete: true,
      preferNewChat: true,
    });

    expect(getChat).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CHAT_ID', chatId: '' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESET_ACTIVE_CONVERSATION' });
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'APPEND_DEBUG' }),
    );
  });

  it('starts a blank worker chat with no-history debug when preferNewChat has no history', async () => {
    const state = createWorkerConversationState({ hasHistory: false });
    const { actions, dispatch } = renderChatActions(state);

    await actions?.selectWorkerConversation('agent:worker_a', {
      focusComposerOnComplete: true,
      preferNewChat: true,
    });

    expect(getChat).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CHAT_ID', chatId: '' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESET_ACTIVE_CONVERSATION' });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'APPEND_DEBUG',
        line: expect.stringContaining('暂无历史对话'),
      }),
    );
  });

  it('keeps default worker selection loading latest history chat', async () => {
    const state = createWorkerConversationState({
      latestChatId: 'row_latest_chat',
      latestChat: {
        chatId: 'chat_latest',
        read: { isRead: true },
      },
    });
    const { actions, dispatch } = renderChatActions(state);
    getChat.mockResolvedValue({ data: { events: [], runs: [] } });

    await actions?.selectWorkerConversation('agent:worker_a', {
      focusComposerOnComplete: true,
    });

    expect(getChat).toHaveBeenCalledWith('row_latest_chat', false);
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'SET_CHAT_ID', chatId: '' });
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'RESET_ACTIVE_CONVERSATION' });
  });

  it('attaches from activeRun.lastSeq instead of replayed chat event seq', async () => {
    const { actions } = renderChatActions();
    getChat.mockResolvedValue({
      data: {
        firstAgentKey: 'askUser.demo',
        events: [
          { seq: 8, type: 'usage.snapshot', runId: 'run_1', chatId: 'chat-attach' },
        ],
        activeRun: {
          runId: 'run_1',
          agentKey: 'askUser.demo',
          lastSeq: 31,
        },
        runs: [],
      },
    });

    await actions?.loadChat('chat-attach');

    expect(globalWithBrowserApis.window?.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent:attach-run',
        detail: {
          chatId: 'chat-attach',
          runId: 'run_1',
          lastSeq: 31,
          agentKey: 'askUser.demo',
        },
      }),
    );
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
