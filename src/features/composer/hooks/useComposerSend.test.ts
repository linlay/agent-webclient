jest.mock('@/shared/data', () => ({
  compactChat: jest.fn(),
  createRequestId: jest.fn((prefix: string) => `${prefix}_request`),
  learnChat: jest.fn(),
  rememberChat: jest.fn(),
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
} from '@/features/composer/hooks/useBackgroundCommandActions';
import { useComposerSend } from '@/features/composer/hooks/useComposerSend';
import type { AIUsageSnapshotEvent } from '@/app/state/types';
import { compactChat, createRequestId } from '@/shared/data';

const compactChatMock = compactChat as jest.Mock;
const createRequestIdMock = createRequestId as jest.Mock;

function testT(key: string, params?: Record<string, unknown>): string {
  if (key === 'contextCompact.completed') return 'Context compacted';
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
  if (key === 'contextCompact.compressionRatio') {
    return `Compression ratio: ${String(params?.ratio || '')}%`;
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
      status: 'compacted',
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
        status: 'compacted',
        requestId: 'server_request',
        chatId: 'chat-1',
        compactId: 'compact-1',
        summarySource: 'model',
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
        compactId: 'compact-1',
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
        text: expect.stringContaining('Context compacted'),
        ts: 12345,
      }),
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'APPEND_TIMELINE_ORDER',
      id: 'compact_compact-1',
    });
    expect(scheduleCommandStatusOverlayHide).toHaveBeenCalledTimes(1);
  });

  it('writes a compact timeline node without usage updates when compact is skipped', async () => {
    compactChatMock.mockResolvedValue({
      data: {
        accepted: false,
        status: 'skipped',
        chatId: 'chat-1',
        detail: 'No history context to compact',
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
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_TIMELINE_NODE',
      id: 'compact_compact_request',
      node: expect.objectContaining({
        messageVariant: 'compact',
        text: 'No history context to compact',
        ts: 999,
      }),
    });
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
});

describe('useComposerSend active run gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createRequestIdMock.mockImplementation((prefix: string) => `${prefix}_request`);
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
        clearRequiredSkill: jest.fn(),
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
        requiredSkillAgentKey: '',
        requiredSkillKeys: [],
        selectSlashCommand: () => null,
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
        clearRequiredSkill: jest.fn(),
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
        requiredSkillAgentKey: '',
        requiredSkillKeys: [],
        selectSlashCommand: () => null,
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
