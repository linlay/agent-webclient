jest.mock('@/shared/data', () => ({
  compactChat: jest.fn(),
  createRequestId: jest.fn((prefix: string) => `${prefix}_request`),
  learnChat: jest.fn(),
  rememberChat: jest.fn(),
}));

jest.mock('@/features/transport/hooks/useRealtimeTransport', () => ({
  useRunTransport: () => ({
    interrupt: jest.fn(),
    steer: jest.fn(),
  }),
}));

jest.mock('@/features/surfaces/openTarget', () => ({
  useOpenTarget: () => jest.fn(),
}));

const mockMessageApi = {
  error: jest.fn(),
  warning: jest.fn(),
};

jest.mock('antd', () => ({
  App: {
    useApp: () => ({ message: mockMessageApi }),
  },
}));

jest.mock('@/features/terminal/lib/terminalDockPersistence', () => ({
  restoreTerminalDockOpen: jest.fn(() => false),
  persistTerminalDockOpen: jest.fn(),
  restoreTerminalDockState: jest.fn(() => ({ open: false, height: null })),
  persistTerminalDockState: jest.fn(),
  resetTerminalDockPersistenceForTests: jest.fn(),
}));

const openBTWMock = jest.fn(() => true);

jest.mock('@/features/btw/components/BtwProvider', () => ({
  useBTW: () => ({
    openBTW: openBTWMock,
  }),
}));

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialState } from '@/app/state/state';
import {
  buildCompactUsageSnapshot,
  latestUsageSnapshotFromEvents,
  runBackgroundCommand,
  useBackgroundCommandActions,
} from '@/features/composer/hooks/useBackgroundCommandActions';
import { useComposerSend } from '@/features/composer/hooks/useComposerSend';
import type { AIUsageSnapshotEvent } from "@/shared/contracts/agentEvents";
import { compactChat, createRequestId } from '@/shared/data';

const compactChatMock = compactChat as jest.Mock;
const createRequestIdMock = createRequestId as jest.Mock;

function testT(key: string, params?: Record<string, unknown>): string {
  if (key === 'contextCompact.completed') return 'Context compacted';
  if (key === 'contextCompact.toolsCompleted') return 'Tool context compacted';
  if (key === 'contextCompact.summaryCompleted') return 'Context summary generated';
  if (key === 'contextCompact.failed') {
    return `Context compaction failed: ${String(params?.detail || '')}`;
  }
  if (key === 'contextCompact.historyChanged') return 'Conversation history changed. Retry compaction.';
  if (key === 'contextCompact.noHistory') return 'No history context to compact';
  if (key === 'contextCompact.source.model') return 'model';
  if (key === 'contextCompact.source.deterministicFallback') return 'fallback';
  if (key === 'contextCompact.summarySource') {
    return `Summary source: ${String(params?.source || '')}`;
  }
  if (key === 'contextCompact.originalMessages') {
    return `Original messages: ${String(params?.count || '')}`;
  }
  if (key === 'contextCompact.toolDigestCount') {
    return `Tool result summaries: ${String(params?.count || '')}`;
  }
  if (key === 'contextCompact.reduction') {
    return `Context remaining ${String(params?.remaining || '')}% / released ${String(params?.released || '')}%`;
  }
  return key;
}

describe('compact usage snapshot helpers', () => {
  it('updates context window size from compact response while preserving usage stats', () => {
    const previous: AIUsageSnapshotEvent = {
      type: 'usage.snapshot',
      chatId: 'chat-1',
      runId: 'run-1',
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
          timing: {
            firstTokenLatencyMs: 820,
            generationDurationMs: 2380,
          },
        },
        run: {
          promptTokens: 13157,
          completionTokens: 210,
          totalTokens: 13367,
          timing: {
            firstTokenLatencyTotalMs: 820,
            firstTokenLatencyCount: 1,
            generationDurationMs: 2380,
          },
          llmChatCompletionCount: 1,
          toolCallCount: 2,
        },
        chat: {
          promptTokens: 53157,
          completionTokens: 1210,
          totalTokens: 54367,
          timing: {
            firstTokenLatencyTotalMs: 900,
            firstTokenLatencyCount: 1,
            generationDurationMs: 4000,
          },
          llmChatCompletionCount: 4,
          toolCallCount: 7,
        },
      },
    };

    const snapshot = buildCompactUsageSnapshot({
      accepted: true,
      status: 'completed',
      chatId: 'chat-1',
      compactId: 'compact-1',
      postCompactEstimatedTokens: 5396,
    }, previous);

    expect(snapshot).toEqual({
      ...previous,
      contextWindow: {
        maxSize: 128000,
        currentSize: 5396,
        estimatedNextCallSize: 5396,
      },
    });
  });

  it('finds the latest usage snapshot in event history for manual compact fallback', () => {
    const older: AIUsageSnapshotEvent = {
      type: 'usage.snapshot',
      chatId: 'chat-1',
      runId: 'run-1',
      contextWindow: {
        maxSize: 128000,
        currentSize: 9000,
      },
    };
    const latest: AIUsageSnapshotEvent = {
      type: 'usage.snapshot',
      chatId: 'chat-1',
      runId: 'run-2',
      contextWindow: {
        maxSize: 128000,
        currentSize: 7733,
      },
    };

    expect(latestUsageSnapshotFromEvents([
      older,
      { type: 'content.delta', text: 'ignored' },
      latest,
    ])).toBe(latest);
  });
});

describe('runBackgroundCommand compact behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createRequestIdMock.mockImplementation((prefix: string) => `${prefix}_request`);
  });

  it('dispatches compact completion event, usage snapshot, and timeline node on success', async () => {
    compactChatMock.mockResolvedValue({
      data: {
        accepted: true,
        status: 'completed',
        requestId: 'server_request',
        chatId: 'chat-1',
        compactId: 'compact-1',
        level: 'summary',
        summarySource: 'model',
        toolsCleared: 0,
        toolsKept: 2,
        tokensFreed: 3604,
        boundaryRunId: 'run-boundary',
        generation: 2,
        toolDigestCount: 3,
        compactedRunCount: 4,
        digestedRunIds: ['run-old-1', 'run-old-2'],
        projectedMessages: 5,
        cacheMetrics: { hits: 2 },
        elapsedMs: 840,
        originalMessages: 10,
        postCompactEstimatedTokens: 5396,
        compactionUsage: {
          promptTokens: 100,
          completionTokens: 20,
          totalTokens: 120,
        },
      },
    });
    const previous: AIUsageSnapshotEvent = {
      type: 'usage.snapshot',
      chatId: 'chat-1',
      runId: 'run-1',
      contextWindow: {
        maxSize: 128000,
        currentSize: 9000,
      },
      usage: {
        chat: {
          totalTokens: 9000,
        },
      },
    };
    const dispatch = jest.fn();
    const scheduleCommandStatusOverlayHide = jest.fn();

    await runBackgroundCommand({
      chatId: 'chat-1',
      commandType: 'compact',
      dispatch,
      events: [],
      now: () => 12345,
      scheduleCommandStatusOverlayHide,
      t: testT,
      texts: {
        pending: 'Compacting context...',
        error: 'Context compaction failed',
      },
      usageSnapshot: previous,
    });

    expect(compactChatMock).toHaveBeenCalledWith({
      requestId: 'compact_request',
      chatId: 'chat-1',
      level: 'summary',
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SHOW_COMMAND_STATUS_OVERLAY',
      commandType: 'compact',
      phase: 'pending',
      text: 'Compacting context...',
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'PUSH_EVENT',
      event: expect.objectContaining({
        type: 'context.compact.complete',
        requestId: 'server_request',
        chatId: 'chat-1',
        runId: 'run-boundary',
        compactId: 'compact-1',
        level: 'summary',
        toolsCleared: 0,
        toolsKept: 2,
        tokensFreed: 3604,
        generation: 2,
        toolDigestCount: 3,
        compactedRunCount: 4,
        digestedRunIds: ['run-old-1', 'run-old-2'],
        originalMessages: 10,
        projectedMessages: 5,
        cacheMetrics: { hits: 2 },
        elapsedMs: 840,
        compactionUsage: {
          promptTokens: 100,
          completionTokens: 20,
          totalTokens: 120,
        },
      }),
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_USAGE_SNAPSHOT',
      snapshot: {
        ...previous,
        contextWindow: {
          maxSize: 128000,
          currentSize: 5396,
          estimatedNextCallSize: 5396,
        },
      },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_TIMELINE_NODE',
      id: 'compact_compact-1',
      node: expect.objectContaining({
        id: 'compact_compact-1',
        kind: 'message',
        role: 'system',
        messageVariant: 'compact',
        text: expect.stringContaining('Context summary generated'),
        ts: 12345,
      }),
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'APPEND_TIMELINE_ORDER',
      id: 'compact_compact-1',
    });
    expect(scheduleCommandStatusOverlayHide).toHaveBeenCalledTimes(1);
  });

  it('submits L1 explicitly and renders released and remaining percentages', async () => {
    compactChatMock.mockResolvedValue({
      data: {
        accepted: true,
        status: 'completed',
        chatId: 'chat-1',
        compactId: 'compact-tools-1',
        level: 'l1_tools',
        toolsCleared: 3,
        toolsKept: 1,
        remainingRatio: 1.18,
        releasedRatio: 98.82,
        postCompactEstimatedTokens: 2334,
      },
    });
    const dispatch = jest.fn();
    await runBackgroundCommand({
      chatId: 'chat-1',
      commandType: 'compact',
      compactLevel: 'l1_tools',
      dispatch,
      events: [],
      scheduleCommandStatusOverlayHide: jest.fn(),
      t: testT,
      texts: { pending: 'Compacting', error: 'Failed' },
      usageSnapshot: null,
    });

    expect(compactChatMock).toHaveBeenCalledWith({
      requestId: 'compact_request',
      chatId: 'chat-1',
      level: 'l1_tools',
    });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SET_TIMELINE_NODE',
      node: expect.objectContaining({
        text: expect.stringContaining('Context remaining 1.18% / released 98.82%'),
      }),
    }));
  });

  it('does not synthesize a duplicate completion when the stream already delivered it', async () => {
    const compactData = {
      accepted: true,
      status: 'completed',
      requestId: 'compact_request',
      chatId: 'chat-1',
      runId: 'run-active',
      compactId: 'compact-live-1',
      trigger: 'manual',
      scope: 'run',
      level: 'summary',
      summarySource: 'model',
      postCompactEstimatedTokens: 3200,
    } as const;
    compactChatMock.mockResolvedValue({ data: compactData });
    const streamedComplete = {
      type: 'context.compact.complete',
      requestId: 'compact_request',
      chatId: 'chat-1',
      runId: 'run-active',
      compactId: 'compact-live-1',
    };
    const dispatch = jest.fn();

    await runBackgroundCommand({
      chatId: 'chat-1',
      commandType: 'compact',
      dispatch,
      events: [],
      getEvents: () => [streamedComplete],
      requestId: 'compact_request',
      scheduleCommandStatusOverlayHide: jest.fn(),
      t: testT,
      texts: {
        pending: 'Compacting context...',
        waiting: 'Waiting for the current step...',
        error: 'Context compaction failed',
      },
      usageSnapshot: null,
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'SHOW_COMMAND_STATUS_OVERLAY',
      commandType: 'compact',
      phase: 'pending',
      text: 'Waiting for the current step...',
    });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'PUSH_EVENT',
    }));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'SET_TIMELINE_NODE',
    }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_USAGE_SNAPSHOT',
      snapshot: expect.objectContaining({
        chatId: 'chat-1',
        contextWindow: expect.objectContaining({ currentSize: 3200 }),
      }),
    });
  });

  it('does not write a success timeline node or usage update when compact is skipped', async () => {
    compactChatMock.mockResolvedValue({
      data: {
        accepted: false,
        status: 'skipped',
        chatId: 'chat-1',
        detail: 'no_compactable_history',
      },
    });
    const dispatch = jest.fn();

    await runBackgroundCommand({
      chatId: 'chat-1',
      commandType: 'compact',
      dispatch,
      events: [],
      now: () => 999,
      scheduleCommandStatusOverlayHide: jest.fn(),
      t: testT,
      texts: {
        pending: 'Compacting context...',
        error: 'Context compaction failed',
      },
      usageSnapshot: null,
    });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'PUSH_EVENT',
    }));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'SET_USAGE_SNAPSHOT',
    }));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'SET_TIMELINE_NODE',
    }));
  });

  it('shows a retry error without completion state when compact history changed', async () => {
    compactChatMock.mockResolvedValue({
      data: {
        accepted: false,
        status: 'skipped',
        chatId: 'chat-1',
        compactId: 'compact-1',
        level: 'summary',
        detail: 'history_changed',
      },
    });
    const dispatch = jest.fn();

    await runBackgroundCommand({
      chatId: 'chat-1',
      commandType: 'compact',
      dispatch,
      events: [],
      scheduleCommandStatusOverlayHide: jest.fn(),
      t: testT,
      texts: {
        pending: 'Compacting context...',
        error: 'Context compaction failed',
      },
      usageSnapshot: null,
    });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'PUSH_EVENT',
    }));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'SET_USAGE_SNAPSHOT',
    }));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'SET_TIMELINE_NODE',
    }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SHOW_COMMAND_STATUS_OVERLAY',
      commandType: 'compact',
      phase: 'error',
      text: 'Conversation history changed. Retry compaction.',
    });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      phase: 'success',
    }));
  });

  it('shows an error overlay and debug line when compact fails', async () => {
    compactChatMock.mockRejectedValue(new Error('network down'));
    const dispatch = jest.fn();
    const scheduleCommandStatusOverlayHide = jest.fn();

    await runBackgroundCommand({
      chatId: 'chat-1',
      commandType: 'compact',
      dispatch,
      events: [],
      scheduleCommandStatusOverlayHide,
      t: testT,
      texts: {
        pending: 'Compacting context...',
        error: 'Context compaction failed',
      },
      usageSnapshot: null,
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'APPEND_DEBUG',
      line: '[compact] failed: network down',
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SHOW_COMMAND_STATUS_OVERLAY',
      commandType: 'compact',
      phase: 'error',
      text: 'Context compaction failed',
    });
    expect(scheduleCommandStatusOverlayHide).toHaveBeenCalledTimes(1);
  });

  it('blocks duplicate compact submissions while the first request is pending', async () => {
    compactChatMock.mockReturnValue(new Promise(() => {}));
    const state = createInitialState();
    state.chatId = 'chat-1';
    const dispatch = jest.fn();
    let actions: ReturnType<typeof useBackgroundCommandActions> | null = null;

    const Harness = () => {
      actions = useBackgroundCommandActions({
        dispatch,
        state: {
          chatId: state.chatId,
          events: state.events,
          usageSnapshot: state.usageSnapshot,
        },
        text: {
          remember: { pending: '', error: '' },
          learn: { pending: '', error: '' },
          compact: {
            pending: 'Compacting context...',
            error: 'Context compaction failed',
          },
        },
      });
      return null;
    };

    renderToStaticMarkup(React.createElement(Harness));
    const first = actions?.submitCompactCommand();
    const duplicate = actions?.submitCompactCommand();

    expect(compactChatMock).toHaveBeenCalledTimes(1);
    await duplicate;
    void first;
    expect(compactChatMock).toHaveBeenCalledTimes(1);
  });
});

describe('useComposerSend active run gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createRequestIdMock.mockImplementation((prefix: string) => `${prefix}_request`);
  });

  it('clears the persisted composer draft before dispatching a new-chat message', () => {
    const state = createInitialState();
    state.pendingNewChatAgentKey = 'agent-a';
    state.composerDraft = 'hello';
    state.composerDraftByChatId = { '': 'hello' };
    const operationOrder: string[] = [];
    const dispatch = jest.fn((action) => {
      if (action.type === 'SET_COMPOSER_DRAFT' && action.draft === '') {
        operationOrder.push('clear-draft');
      }
    });
    const setInputValue = jest.fn();
    const setSlashDismissed = jest.fn();
    const closeMention = jest.fn();
    let actions: ReturnType<typeof useComposerSend> | null = null;
    const originalWindow = globalThis.window;
    const originalCustomEvent = globalThis.CustomEvent;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { search: '' },
        localStorage: {
          getItem: jest.fn(() => null),
          setItem: jest.fn(),
        },
        dispatchEvent: jest.fn((event: Event) => {
          if (event.type === 'agent:send-message') {
            operationOrder.push('send-message');
          }
          return true;
        }),
      },
    });
    Object.defineProperty(globalThis, 'CustomEvent', {
      configurable: true,
      value: class TestCustomEvent<T = unknown> {
        detail: T | undefined;
        type: string;

        constructor(type: string, init?: CustomEventInit<T>) {
          this.type = type;
          this.detail = init?.detail;
        }
      },
    });

    const Harness = () => {
      actions = useComposerSend({
        accessLevel: 'default',
        attachmentChatId: '',
        backgroundCommandText: {
          rememberPending: '',
          rememberError: '',
          learnPending: '',
          learnError: '',
          compactPending: '',
          compactError: '',
        },
        clearComposerAttachments: jest.fn(),
        clearMustUseSkills: jest.fn(),
        closeMention,
        controlParams: {},
        dispatch,
        executeSlashCommandInput: {
          closeMention,
          latestQueryText: '',
          setInputValue,
          setSlashDismissed,
          slashAvailability: {
            streaming: false,
            hasLatestQuery: false,
            isFrontendActive: false,
            canUsePlanningMode: true,
            canUseVoiceMode: true,
            hasActiveChat: false,
            hasCurrentWorker: true,
            workerHistoryCount: 0,
            commandOverlayOpen: false,
            canShowUsage: false,
          },
          state: {
            rightSidebarOpen: false,
            planningMode: false,
            editingMode: false,
            chatId: '',
            runId: '',
            usagePopoverOpen: false,
          },
          toggleVoiceMode: jest.fn(),
        },
        hasUploadingAttachments: false,
        inputValue: 'hello',
        isAwaitingActive: false,
        isVoiceMode: false,
        mainChatRunning: false,
        modelOverride: {},
        mustUseSkillsAgentKey: '',
        mustUseSkills: [],
        selectSlashItem: () => null,
        onSelectSlashSkill: jest.fn(),
        sendAttachmentMeta: [],
        sendReferences: [],
        setInputValue,
        setSlashDismissed,
        showSlashPalette: false,
        speechListening: false,
        state,
        stateRef: { current: state },
        querySessionsRef: { current: new Map() },
        activeQuerySessionRequestIdRef: { current: '' },
        stopSpeechInput: jest.fn(),
        textareaRef: React.createRef(),
        updateMentionSuggestions: jest.fn(),
      });
      return null;
    };

    try {
      renderToStaticMarkup(React.createElement(Harness));
      actions?.handleSend();
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
      Object.defineProperty(globalThis, 'CustomEvent', {
        configurable: true,
        value: originalCustomEvent,
      });
    }

    expect(setInputValue).toHaveBeenCalledWith('');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_COMPOSER_DRAFT',
      draft: '',
    });
    expect(operationOrder).toEqual(['clear-draft', 'send-message']);
  });

  it('queues a steer instead of sending a new query when the main chat has activeRun but streaming is false', () => {
    const state = createInitialState();
    state.chatId = 'chat-1';
    state.currentChatActiveRun = {
      chatId: 'chat-1',
      runId: 'run-active',
      agentKey: 'agent-a',
    };
    state.chatAgentById = new Map([['chat-1', 'agent-a']]);
    state.runAgentById = new Map([['run-active', 'agent-a']]);
    state.streaming = false;
    const dispatch = jest.fn();
    const setInputValue = jest.fn();
    const setSlashDismissed = jest.fn();
    const closeMention = jest.fn();
    let actions: ReturnType<typeof useComposerSend> | null = null;

    const Harness = () => {
      actions = useComposerSend({
        accessLevel: 'default',
        attachmentChatId: '',
        backgroundCommandText: {
          rememberPending: '',
          rememberError: '',
          learnPending: '',
          learnError: '',
          compactPending: '',
          compactError: '',
        },
        clearComposerAttachments: jest.fn(),
        clearMustUseSkills: jest.fn(),
        closeMention,
        controlParams: {},
        dispatch,
        executeSlashCommandInput: {
          closeMention,
          latestQueryText: '',
          setInputValue,
          setSlashDismissed,
          slashAvailability: {
            streaming: false,
            hasLatestQuery: false,
            isFrontendActive: false,
            canUsePlanningMode: true,
            canUseVoiceMode: true,
            hasActiveChat: true,
            hasCurrentWorker: true,
            workerHistoryCount: 1,
            commandOverlayOpen: false,
            canShowUsage: false,
          },
          state: {
            rightSidebarOpen: false,
            planningMode: false,
            chatId: state.chatId,
            usagePopoverOpen: false,
          },
          toggleVoiceMode: jest.fn(),
        },
        hasUploadingAttachments: false,
        inputValue: 'hello',
        isAwaitingActive: false,
        isVoiceMode: false,
        modelOverride: {},
        mustUseSkillsAgentKey: '',
        mustUseSkills: [],
        selectSlashItem: () => null,
        onSelectSlashSkill: jest.fn(),
        sendAttachmentMeta: [],
        sendReferences: [],
        setInputValue,
        setSlashDismissed,
        showSlashPalette: false,
        speechListening: false,
        state,
        stateRef: { current: state },
        stopSpeechInput: jest.fn(),
        textareaRef: React.createRef(),
        updateMentionSuggestions: jest.fn(),
      });
      return null;
    };

    renderToStaticMarkup(React.createElement(Harness));
    actions?.handleSend();

    expect(dispatch).toHaveBeenCalledWith({
      type: 'ENQUEUE_PENDING_STEER',
      steer: expect.objectContaining({
        message: 'hello',
        requestId: 'req_request',
        runId: 'run-active',
        status: 'queued',
      }),
    });
    expect(setInputValue).toHaveBeenCalledWith('');
    expect(closeMention).toHaveBeenCalled();
  });

  it('routes an inline /btw question before the active-run steer path', () => {
    const state = createInitialState();
    state.chatId = 'chat-1';
    state.currentChatActiveRun = {
      chatId: 'chat-1',
      runId: 'run-active',
      agentKey: 'agent-a',
    };
    state.chatAgentById = new Map([['chat-1', 'agent-a']]);
    const dispatch = jest.fn();
    const setInputValue = jest.fn();
    const clearComposerAttachments = jest.fn();
    let actions: ReturnType<typeof useComposerSend> | null = null;

    const Harness = () => {
      actions = useComposerSend({
        accessLevel: 'default',
        attachmentChatId: '',
        backgroundCommandText: {
          rememberPending: '',
          rememberError: '',
          learnPending: '',
          learnError: '',
          compactPending: '',
          compactError: '',
        },
        clearComposerAttachments,
        clearMustUseSkills: jest.fn(),
        closeMention: jest.fn(),
        controlParams: { temperature: 0.2 },
        dispatch,
        executeSlashCommandInput: {
          closeMention: jest.fn(),
          latestQueryText: '',
          setInputValue,
          setSlashDismissed: jest.fn(),
          slashAvailability: {
            streaming: true,
            hasLatestQuery: true,
            isFrontendActive: false,
            canUsePlanningMode: false,
            canUseVoiceMode: false,
            hasActiveChat: true,
            hasCurrentWorker: true,
            workerHistoryCount: 1,
            commandOverlayOpen: false,
            canShowUsage: true,
          },
          state: {
            rightSidebarOpen: false,
            planningMode: false,
            chatId: state.chatId,
            usagePopoverOpen: false,
          },
          toggleVoiceMode: jest.fn(),
        },
        hasUploadingAttachments: false,
        inputValue: '/btw side question',
        isAwaitingActive: false,
        isVoiceMode: false,
        mainChatRunning: true,
        modelOverride: { key: 'model-a' },
        mustUseSkillsAgentKey: '',
        mustUseSkills: [],
        selectSlashItem: () => null,
        onSelectSlashSkill: jest.fn(),
        sendAttachmentMeta: [{ name: 'spec.md', size: 12 }],
        sendReferences: [{ name: 'spec.md', path: '/tmp/spec.md' }],
        setInputValue,
        setSlashDismissed: jest.fn(),
        showSlashPalette: false,
        speechListening: false,
        state,
        stateRef: { current: state },
        querySessionsRef: { current: new Map() },
        activeQuerySessionRequestIdRef: { current: '' },
        stopSpeechInput: jest.fn(),
        textareaRef: React.createRef(),
        updateMentionSuggestions: jest.fn(),
      });
      return null;
    };

    renderToStaticMarkup(React.createElement(Harness));
    actions?.handleSend();

    expect(openBTWMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parentChatId: 'chat-1',
        message: 'side question',
        references: [{ name: 'spec.md', path: '/tmp/spec.md' }],
        attachments: [{ name: 'spec.md', size: 12 }],
        model: { key: 'model-a' },
        params: { temperature: 0.2 },
        sendImmediately: true,
      }),
    );
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ENQUEUE_PENDING_STEER' }),
    );
    expect(setInputValue).toHaveBeenCalledWith('');
    expect(clearComposerAttachments).toHaveBeenCalled();
  });
});
