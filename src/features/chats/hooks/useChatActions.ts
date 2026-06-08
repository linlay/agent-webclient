import { useCallback, useEffect, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useAppContext } from '@/app/state/AppContext';
import { getChat, markChatRead } from '@/features/transport/lib/apiClientProxy';
import type {
  ArtifactFile,
  Chat,
  AgentEvent,
  Plan,
  PublishedArtifact,
  WorkerRow,
  AIUsageSnapshotEvent,
  AIUsageStats,
} from '@/app/state/types';
import { AIUsageEventTypeEnum } from '@/app/state/types';
import { normalizeChatReadState, upsertAgentUnreadCount } from '@/features/chats/lib/chatReadState';
import { isChatActiveRun, isWorkerAttentionChat } from '@/features/chats/lib/chatRunState';
import { createWorkerKeyFromChat } from '@/features/workers/lib/workerListFormatter';
import { buildWorkerConversationRows } from '@/features/workers/lib/workerConversationFormatter';
import { useWorkerData } from '@/features/workers/hooks/useWorkerData';
import {
  markSessionSnapshotApplied,
  snapshotConversationState,
} from '@/features/chats/lib/conversationSession';
import { resolveRunAgentKey } from '@/features/chats/lib/runAgentIdentity';
import { createReplayState, replayEvent, setReplayArtifacts, setReplayPlan, type ReplayState } from '@/features/chats/lib/conversationReplay';
import { dispatchDetachRunEvent, type DetachRunReason } from '@/features/transport/lib/detachRunEvent';

/**
 * Replay state — mutable structure used during synchronous event replay.
 * Avoids React batching issues by building up the full timeline locally,
 * then dispatching the complete result via BATCH_UPDATE.
 */
export type { ReplayState } from '@/features/chats/lib/conversationReplay';
export { createReplayState, replayEvent, setReplayArtifacts, setReplayPlan } from '@/features/chats/lib/conversationReplay';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

export function shouldAutoMarkChatRead(chat: Pick<Chat, 'chatId' | 'read'> | null | undefined): boolean {
  return Boolean(String(chat?.chatId || '').trim()) && chat?.read?.isRead === false;
}

export function getAutoReadTriggerKey(
  chat: Pick<Chat, 'chatId' | 'lastRunId' | 'updatedAt' | 'read'> | null | undefined,
): string {
  if (!shouldAutoMarkChatRead(chat)) {
    return '';
  }

  return [
    String(chat?.chatId || '').trim(),
    String(chat?.lastRunId || '').trim(),
    String(chat?.updatedAt ?? '').trim(),
    String(chat?.read?.readAt ?? '').trim(),
    String(chat?.read?.readRunId || '').trim(),
  ].join('|');
}

export interface StartNewConversationDetail {
  agentKey?: unknown;
  preserveWorkerContext?: unknown;
  focusComposerOnComplete?: unknown;
}

export function normalizeStartNewConversationDetail(
  detail: StartNewConversationDetail | null | undefined,
  currentConversationMode: string,
): {
  agentKey: string;
  preserveWorkerContext: boolean;
  focusComposerOnComplete: boolean;
} {
  const agentKey = String(detail?.agentKey || '').trim();
  return {
    agentKey,
    preserveWorkerContext: Boolean(detail?.preserveWorkerContext)
      || Boolean(agentKey)
      || currentConversationMode === 'worker',
    focusComposerOnComplete: Boolean(detail?.focusComposerOnComplete),
  };
}

function normalizeChatPlan(value: unknown): Plan | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  if (!isObjectRecord(value)) return undefined;

  const planId = String(value.planId || '').trim();
  if (!planId || !Array.isArray(value.tasks)) {
    return undefined;
  }
  const plan = value.tasks
    .filter((item): item is Record<string, unknown> => isObjectRecord(item) && typeof item.taskId === 'string')
    .map((item) => ({
      ...item,
      taskId: String(item.taskId),
    }));

  return {
    planId,
    plan,
  };
}

function normalizeArtifactFile(value: unknown): PublishedArtifact | null {
  if (!isObjectRecord(value)) return null;

  const url = String(value.url || '').trim();
  const artifactId = String(value.artifactId || value.sha256 || value.url || value.name || '').trim();
  if (!url || !artifactId) {
    return null;
  }

  const sizeBytes = Number(value.sizeBytes ?? value.size);
  const timestamp = Number(value.timestamp ?? value.createdAt ?? value.updatedAt);

  return {
    artifactId,
    artifact: {
      type: 'file',
      name: String(value.name || artifactId).trim() || artifactId,
      mimeType: String(value.mimeType || 'application/octet-stream').trim() || 'application/octet-stream',
      sha256: String(value.sha256 || '').trim(),
      sizeBytes: Number.isFinite(sizeBytes) && sizeBytes >= 0 ? sizeBytes : 0,
      url,
    },
    timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0,
  };
}

function dispatchAttachRunEvent(chatId: string, runId: string, lastSeq = 0, agentKey = ''): void {
  if (
    typeof window === 'undefined'
    || typeof window.dispatchEvent !== 'function'
    || typeof CustomEvent !== 'function'
  ) {
    return;
  }
  window.dispatchEvent(
    new CustomEvent('agent:attach-run', {
      detail: { chatId, runId, lastSeq, agentKey },
    }),
  );
}

function maybeDispatchDetachRunEvent(detail: {
  chatId?: string;
  runId?: string;
  agentKey?: string;
  reason: DetachRunReason;
}): boolean {
  const runId = String(detail.runId || '').trim();
  if (!runId) {
    return false;
  }
  dispatchDetachRunEvent({
    chatId: String(detail.chatId || '').trim(),
    runId,
    agentKey: String(detail.agentKey || '').trim(),
    reason: detail.reason,
  });
  return true;
}

function normalizeAttachLastSeq(value: unknown): number {
  const seq = Number(value ?? 0);
  return Number.isFinite(seq) && seq >= 0 ? seq : 0;
}

export function normalizeChatArtifactItems(value: unknown): PublishedArtifact[] | undefined {
  if (value === undefined) return undefined;
  if (value == null) return [];
  if (!isObjectRecord(value)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(value, 'items')) return undefined;
  if (value.items == null) return [];
  if (!Array.isArray(value.items)) return undefined;

  return value.items
    .map((item) => normalizeArtifactFile(item as ArtifactFile))
    .filter((item): item is PublishedArtifact => Boolean(item));
}

function readUsageNumber(value: unknown): number | undefined {
  const next = Number(value);
  return Number.isFinite(next) && next >= 0 ? next : undefined;
}

function normalizeUsageTokenDetails(value: unknown): AIUsageStats['promptTokensDetails'] | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const cacheHitTokens = readUsageNumber(value.cacheHitTokens);
  const cacheMissTokens = readUsageNumber(value.cacheMissTokens);
  const reasoningTokens = readUsageNumber(value.reasoningTokens);
  const details: NonNullable<AIUsageStats['promptTokensDetails']> = {};
  if (cacheHitTokens !== undefined) {
    details.cacheHitTokens = cacheHitTokens;
  }
  if (cacheMissTokens !== undefined) {
    details.cacheMissTokens = cacheMissTokens;
  }
  if (reasoningTokens !== undefined) {
    details.reasoningTokens = reasoningTokens;
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

function normalizeUsageEstimatedCost(value: unknown): AIUsageStats['estimatedCost'] | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const cost: NonNullable<AIUsageStats['estimatedCost']> = {};
  const currency = typeof value.currency === 'string' ? value.currency.trim() : '';
  if (currency) {
    cost.currency = currency;
  }

  for (const key of ['inputCacheHit', 'inputCacheMiss', 'output', 'total'] as const) {
    const next = readUsageNumber(value[key]);
    if (next !== undefined) {
      cost[key] = next;
    }
  }

  return Object.keys(cost).length > 0 ? cost : undefined;
}

export function normalizeLoadedChatUsageStats(value: unknown): AIUsageStats | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const stats: AIUsageStats = {};
  const modelKey = String(value.modelKey || value.model_key || '').trim();
  if (modelKey) {
    stats.modelKey = modelKey;
  }
  const numericKeys = [
    'promptTokens',
    'completionTokens',
    'totalTokens',
    'llmChatCompletionCount',
    'toolCallCount',
  ] as const;

  for (const key of numericKeys) {
    const next = readUsageNumber(value[key]);
    if (next !== undefined) {
      stats[key] = next;
    }
  }

  const promptTokensDetails = normalizeUsageTokenDetails(value.promptTokensDetails);
  if (promptTokensDetails) {
    stats.promptTokensDetails = promptTokensDetails;
  }

  const completionTokensDetails = normalizeUsageTokenDetails(value.completionTokensDetails);
  if (completionTokensDetails) {
    stats.completionTokensDetails = completionTokensDetails;
  }

  const estimatedCost = normalizeUsageEstimatedCost(value.estimatedCost);
  if (estimatedCost) {
    stats.estimatedCost = estimatedCost;
  }

  const totalTokens = stats.totalTokens ?? 0;
  const llmChatCompletionCount = stats.llmChatCompletionCount ?? 0;
  const toolCallCount = stats.toolCallCount ?? 0;
  return totalTokens > 0 || llmChatCompletionCount > 0 || toolCallCount > 0 || estimatedCost ? stats : null;
}

function getLatestUsageSnapshotEvent(events: unknown[]): AIUsageSnapshotEvent | null {
  for (const event of events.slice().reverse()) {
    if (!isObjectRecord(event)) continue;
    if (event.type !== AIUsageEventTypeEnum.Snapshot) continue;
    return event as AIUsageSnapshotEvent;
  }

  return null;
}

function normalizeLoadedChatContextWindow(value: unknown): AIUsageSnapshotEvent['contextWindow'] | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const contextWindow: NonNullable<AIUsageSnapshotEvent['contextWindow']> = {};
  const maxSize = readUsageNumber(value.maxSize);
  const currentSize = readUsageNumber(value.currentSize);
  const estimatedNextCallSize = readUsageNumber(value.estimatedNextCallSize);
  if (maxSize !== undefined) {
    contextWindow.maxSize = maxSize;
  }
  if (currentSize !== undefined) {
    contextWindow.currentSize = currentSize;
  }
  if (estimatedNextCallSize !== undefined) {
    contextWindow.estimatedNextCallSize = estimatedNextCallSize;
  }

  const modelKey = String(value.modelKey || '').trim();
  if (modelKey) {
    contextWindow.modelKey = modelKey;
  }
  const reasoningEffort = String(value.reasoningEffort || '').trim();
  if (reasoningEffort) {
    contextWindow.reasoningEffort = reasoningEffort;
  }

  return Object.keys(contextWindow).length > 0 ? contextWindow : undefined;
}

interface LoadedUsageSnapshotResult {
  snapshot: AIUsageSnapshotEvent;
  index: number;
}

function latestLoadedUsageSnapshotFromEvents(
  chatId: string,
  events: unknown,
): LoadedUsageSnapshotResult | null {
  if (!Array.isArray(events)) {
    return null;
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!isObjectRecord(event) || event.type !== AIUsageEventTypeEnum.Snapshot) {
      continue;
    }
    const snapshot = event as unknown as AIUsageSnapshotEvent;
    if (!snapshot.contextWindow && !snapshot.usage) {
      continue;
    }
    return {
      snapshot: {
        ...snapshot,
        type: AIUsageEventTypeEnum.Snapshot,
        chatId: String(snapshot.chatId || chatId),
      },
      index,
    };
  }

  return null;
}

function latestCompactPostTokensAfterSnapshot(
  events: unknown,
  snapshot: LoadedUsageSnapshotResult,
): number | undefined {
  if (!Array.isArray(events)) {
    return undefined;
  }

  const snapshotTimestamp = readUsageNumber(snapshot.snapshot.timestamp);
  let bestRank = -1;
  let bestTokens: number | undefined;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!isObjectRecord(event) || event.type !== 'context.compact.complete') {
      continue;
    }
    const postTokens = readUsageNumber(event.postCompactEstimatedTokens);
    if (postTokens === undefined) {
      continue;
    }
    const eventTimestamp = readUsageNumber(event.timestamp);
    const isAfterSnapshot =
      snapshotTimestamp !== undefined && eventTimestamp !== undefined
        ? eventTimestamp > snapshotTimestamp
        : index > snapshot.index;
    if (!isAfterSnapshot) {
      continue;
    }
    const rank = eventTimestamp ?? index;
    if (rank >= bestRank) {
      bestRank = rank;
      bestTokens = postTokens;
    }
  }

  return bestTokens;
}

function getRunId(value: unknown): string {
  return isObjectRecord(value) ? String(value.runId || '').trim() : '';
}

function getModelKey(value: unknown): string {
  if (!isObjectRecord(value)) {
    return '';
  }

  const model = value.model;
  if (isObjectRecord(model)) {
    const key = String(model.key || model.modelKey || '').trim();
    if (key) {
      return key;
    }
  }
  if (typeof model === 'string') {
    const key = model.trim();
    if (key) {
      return key;
    }
  }

  if (isObjectRecord(value.contextWindow)) {
    const cwKey = String(value.contextWindow.modelKey || '').trim();
    if (cwKey) {
      return cwKey;
    }
  }

  return String(value.modelKey || '').trim();
}

function resolveLoadedChatUsagePayload(
  chatData: Record<string, unknown>,
  latestUsageEvent: AIUsageSnapshotEvent | null,
): AIUsageSnapshotEvent['usage'] | null {
  const usage = isObjectRecord(chatData.usage) ? chatData.usage : null;
  const flatChatUsage = normalizeLoadedChatUsageStats(usage);
  const nestedCurrentUsage = normalizeLoadedChatUsageStats(usage?.current);
  const nestedRunUsage =
    normalizeLoadedChatUsageStats(usage?.run)
    || normalizeLoadedChatUsageStats(usage?.lastRun);
  const nestedChatUsage = normalizeLoadedChatUsageStats(usage?.chat);
  const eventCurrentUsage = normalizeLoadedChatUsageStats(latestUsageEvent?.usage?.current);

  const run = nestedRunUsage || undefined;
  const chat = nestedChatUsage || flatChatUsage || undefined;
  const current = nestedCurrentUsage || eventCurrentUsage || (run || chat ? {} : undefined);

  if (!current && !run && !chat) {
    return null;
  }

  return {
    ...(current ? { current } : {}),
    ...(run ? { run } : {}),
    ...(chat ? { chat } : {}),
  };
}

export function buildLoadedChatUsageSnapshot(
  chatId: string,
  chatData: Record<string, unknown>,
): AIUsageSnapshotEvent | null {
  const events = Array.isArray(chatData.events) ? chatData.events : [];
  const eventSnapshot = latestLoadedUsageSnapshotFromEvents(chatId, events);
  const latestUsageEvent = eventSnapshot?.snapshot ?? getLatestUsageSnapshotEvent(events);
  const usage = resolveLoadedChatUsagePayload(chatData, latestUsageEvent);
  const runs = Array.isArray(chatData.runs) ? chatData.runs.filter(isObjectRecord) : [];
  const activeRun = isObjectRecord(chatData.activeRun) ? chatData.activeRun : null;
  const latestRun = runs.slice().reverse().find((run) => getRunId(run));
  const runWithUsage =
    (activeRun && normalizeLoadedChatUsageStats(activeRun.usage) ? activeRun : null)
    || runs.slice().reverse().find((run) => Boolean(normalizeLoadedChatUsageStats(run.usage)))
    || null;
  const runUsage = runWithUsage ? normalizeLoadedChatUsageStats(runWithUsage.usage) : null;
  const runId = getRunId(activeRun)
    || getRunId(runWithUsage)
    || getRunId(latestRun)
    || String(latestUsageEvent?.runId || '').trim();
  const modelKey = getModelKey(activeRun)
    || getModelKey(runWithUsage)
    || getModelKey(latestRun)
    || getModelKey(latestUsageEvent || undefined);
  if (eventSnapshot) {
    const compactPostTokens = latestCompactPostTokensAfterSnapshot(events, eventSnapshot);
    const contextWindow = compactPostTokens === undefined
      ? eventSnapshot.snapshot.contextWindow
      : {
        ...(eventSnapshot.snapshot.contextWindow || {}),
        currentSize: compactPostTokens,
        estimatedNextCallSize: compactPostTokens,
      };
    return {
      ...eventSnapshot.snapshot,
      ...(runId ? { runId } : {}),
      ...(modelKey ? { model: { key: modelKey } } : {}),
      ...(contextWindow ? { contextWindow: { ...contextWindow, ...(modelKey ? { modelKey } : {}) } } : {}),
      usage: {
        ...(eventSnapshot.snapshot.usage || {}),
        ...(usage || {}),
        ...(runUsage && !eventSnapshot.snapshot.usage?.run && !usage?.run ? { run: runUsage } : {}),
      },
    };
  }
  if (!usage) {
    const contextWindow = normalizeLoadedChatContextWindow(chatData.contextWindow);
    if (contextWindow) {
      return {
        type: AIUsageEventTypeEnum.Snapshot,
        chatId,
        ...(runId ? { runId } : {}),
        ...(modelKey ? { model: { key: modelKey } } : {}),
        contextWindow: {
          ...contextWindow,
          ...(modelKey ? { modelKey } : {}),
        },
        usage: {},
      };
    }
    return null;
  }

  const contextWindow =
    normalizeLoadedChatContextWindow(chatData.contextWindow)
    || normalizeLoadedChatContextWindow(latestUsageEvent?.contextWindow);

  return {
    type: AIUsageEventTypeEnum.Snapshot,
    chatId,
    runId,
    ...(modelKey ? { model: { key: modelKey } } : {}),
    ...(contextWindow ? { contextWindow: { ...contextWindow, ...(modelKey ? { modelKey } : {}) } } : {}),
    usage: {
      ...usage,
      ...(runUsage && !usage.run ? { run: runUsage } : {}),
    },
  };
}

/**
 * useChatActions — handles loading agents, chats, and switching chat context.
 */
export function useChatActions() {
  const {
    state,
    dispatch,
    stateRef,
    querySessionsRef,
    activeQuerySessionRequestIdRef,
  } = useAppContext();
  const loadSeqRef = useRef(0);
  const lastAutoReadTriggerKeyRef = useRef('');

  const clearPlanAutoCollapseTimer = useCallback(() => {
    const timer = stateRef.current.planAutoCollapseTimer;
    if (timer) {
      window.clearTimeout(timer);
      dispatch({ type: 'SET_PLAN_AUTO_COLLAPSE_TIMER', timer: null });
    }
  }, [dispatch, stateRef]);

  const clearArtifactAutoCollapseTimer = useCallback(() => {
    const timer = stateRef.current.artifactAutoCollapseTimer;
    if (timer) {
      window.clearTimeout(timer);
      dispatch({ type: 'SET_ARTIFACT_AUTO_COLLAPSE_TIMER', timer: null });
    }
  }, [dispatch, stateRef]);

  const focusComposerSoon = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('agent:focus-composer'));
    });
  }, []);

  const applyLoadedChatState = useCallback((chatId: string) => {
    dispatch({ type: 'SET_CHAT_ID', chatId });
    clearArtifactAutoCollapseTimer();
    clearPlanAutoCollapseTimer();
    dispatch({ type: 'RESET_CONVERSATION' });
    window.dispatchEvent(new CustomEvent('agent:reset-event-cache'));
    window.dispatchEvent(new CustomEvent('agent:voice-reset'));
  }, [clearArtifactAutoCollapseTimer, clearPlanAutoCollapseTimer, dispatch]);

  const detachActiveConversationSession = useCallback(() => {
    const state = stateRef.current;
    const activeRequestId = String(activeQuerySessionRequestIdRef.current || '').trim();
    if (!activeRequestId) {
      return null;
    }

    const hasActiveVoiceQuery =
      state.inputMode === 'voice'
      || state.voiceChat.sessionActive
      || Boolean(String(state.voiceChat.activeRequestId || '').trim());
    if (hasActiveVoiceQuery) {
      state.abortController?.abort();
      activeQuerySessionRequestIdRef.current = '';
      return null;
    }

    const session = querySessionsRef.current.get(activeRequestId) || null;
    if (!session) {
      activeQuerySessionRequestIdRef.current = '';
      return null;
    }

    session.snapshot = snapshotConversationState(state);
    session.chatId = session.chatId || String(state.chatId || '').trim();
    session.runId = session.runId || String(state.runId || '').trim();
    session.streaming = Boolean(state.streaming);
    session.abortController = state.abortController;
    markSessionSnapshotApplied(session);
    if (state.transportMode === 'sse') {
      state.abortController?.abort();
    }

    activeQuerySessionRequestIdRef.current = '';
    return session;
  }, [activeQuerySessionRequestIdRef, querySessionsRef, stateRef]);

  const dispatchDetachActiveRun = useCallback((reason: DetachRunReason, targetChatId = '') => {
    const state = stateRef.current;
    const activeRequestId = String(activeQuerySessionRequestIdRef.current || '').trim();
    const session = activeRequestId
      ? querySessionsRef.current.get(activeRequestId) || null
      : null;
    const chatId = String(session?.chatId || state.chatId || '').trim();
    const normalizedTargetChatId = String(targetChatId || '').trim();
    if (normalizedTargetChatId && chatId && normalizedTargetChatId === chatId) {
      return;
    }
    if (!session?.streaming && !state.streaming) {
      return;
    }

    const runId = String(session?.runId || state.runId || '').trim();
    const agentKey = resolveRunAgentKey({
      runId,
      agentKey: session?.agentKey,
      currentRunAgentKey: state.currentRunAgentKey,
      runAgentById: state.runAgentById,
      chatId,
      chatAgentById: state.chatAgentById,
      chats: state.chats,
    });
    if (maybeDispatchDetachRunEvent({ chatId, runId, agentKey, reason })) {
      return;
    }

    dispatch({
      type: 'APPEND_DEBUG',
      line: `[detach] skipped: missing runId or agentKey (chatId=${chatId || '-'})`,
    });
  }, [activeQuerySessionRequestIdRef, dispatch, querySessionsRef, stateRef]);

  const activateBlankConversation = useCallback((options: {
    preserveWorkerContext?: boolean;
    focusComposerOnComplete?: boolean;
  } = {}) => {
    const preserveWorkerContext = Boolean(options.preserveWorkerContext);
    const focusComposerOnComplete = Boolean(options.focusComposerOnComplete);

    loadSeqRef.current += 1;
    dispatchDetachActiveRun('new_conversation');
    detachActiveConversationSession();
    clearArtifactAutoCollapseTimer();
    clearPlanAutoCollapseTimer();
    window.dispatchEvent(new CustomEvent('agent:reset-event-cache'));
    window.dispatchEvent(new CustomEvent('agent:clear-composer-attachments'));
    window.dispatchEvent(new CustomEvent('agent:voice-reset'));
    dispatch({ type: 'SET_CHAT_ID', chatId: '' });
    dispatch({ type: 'SET_RUN_ID', runId: '' });
    dispatch({ type: 'SET_REQUEST_ID', requestId: '' });
    dispatch({ type: 'SET_STREAMING', streaming: false });
    dispatch({ type: 'SET_ABORT_CONTROLLER', controller: null });
    dispatch({
      type: preserveWorkerContext ? 'RESET_ACTIVE_CONVERSATION' : 'RESET_CONVERSATION',
    });
    if (focusComposerOnComplete) {
      focusComposerSoon();
    }
  }, [clearArtifactAutoCollapseTimer, clearPlanAutoCollapseTimer, detachActiveConversationSession, dispatch, dispatchDetachActiveRun, focusComposerSoon]);

  const syncMarkReadResult = useCallback((chatId: string, data: unknown) => {
    if (!isObjectRecord(data)) {
      return;
    }

    const read = normalizeChatReadState(data.read);
    if (read) {
      dispatch({ type: 'UPSERT_CHAT', chat: { chatId, read } });
    }

    const agentKey = String(data.agentKey || '').trim();
    const agentUnreadCount = Number(data.agentUnreadCount);
    if (agentKey && Number.isFinite(agentUnreadCount) && agentUnreadCount >= 0) {
      const nextAgents = upsertAgentUnreadCount(stateRef.current.agents, agentKey, agentUnreadCount);
      if (nextAgents === stateRef.current.agents) {
        return;
      }
      dispatch({
        type: 'SET_AGENTS',
        agents: nextAgents,
      });
    }
  }, [dispatch, stateRef]);

  const autoMarkReadIfNeeded = useCallback(async (chat: Chat | undefined) => {
    if (!shouldAutoMarkChatRead(chat)) {
      return;
    }

    try {
      const response = await markChatRead({
        chatId: String(chat?.chatId || '').trim(),
        runId: String(chat?.lastRunId || '').trim() || undefined,
      });
      syncMarkReadResult(String(chat?.chatId || '').trim(), response.data);
    } catch (error) {
      dispatch({ type: 'APPEND_DEBUG', line: `[markRead error] ${(error as Error).message}` });
    }
  }, [dispatch, syncMarkReadResult]);

  const activeChat = useMemo(
    () => state.chats.find((chat) => String(chat?.chatId || '') === String(state.chatId || '')),
    [state.chatId, state.chats],
  );
  const autoReadTriggerKey = useMemo(
    () => getAutoReadTriggerKey(activeChat),
    [activeChat],
  );

  useEffect(() => {
    if (!autoReadTriggerKey || !activeChat) {
      return;
    }
    if (lastAutoReadTriggerKeyRef.current === autoReadTriggerKey) {
      return;
    }

    lastAutoReadTriggerKeyRef.current = autoReadTriggerKey;
    void autoMarkReadIfNeeded(activeChat);
  }, [activeChat, autoMarkReadIfNeeded, autoReadTriggerKey]);

  const loadChat = useCallback(
    async (chatId: string, options: { focusComposerOnComplete?: boolean } = {}) => {
      if (!chatId) return;
      const focusComposerOnComplete = Boolean(options.focusComposerOnComplete);
      const currentChatId = String(stateRef.current.chatId || '').trim();
      if (currentChatId && currentChatId === chatId && stateRef.current.streaming) {
        if (focusComposerOnComplete) {
          focusComposerSoon();
        }
        return;
      }

      const seq = ++loadSeqRef.current;
      dispatchDetachActiveRun('chat_switch', chatId);
      detachActiveConversationSession();

      const currentChat = stateRef.current.chats.find((chat) => String(chat?.chatId || '') === String(chatId));
      const workerKey = createWorkerKeyFromChat((currentChat || {}) as Chat);
      if (workerKey) {
        dispatch({ type: 'SET_WORKER_SELECTION_KEY', workerKey });
        const worker = stateRef.current.workerIndexByKey.get(workerKey) as WorkerRow | undefined;
        const workerChats = buildWorkerConversationRows({
          chats: stateRef.current.chats,
          worker: worker || null,
        });
        dispatch({ type: 'SET_WORKER_RELATED_CHATS', chats: workerChats });
      }

      try {
        const response = await getChat(chatId, false);
        if (seq !== loadSeqRef.current) return;

        const chatData = response.data as Record<string, unknown>;
        const chatArtifacts = normalizeChatArtifactItems(chatData.artifact);
        const usageSnapshot = buildLoadedChatUsageSnapshot(chatId, chatData);
        const hasPlanSnapshot = Object.prototype.hasOwnProperty.call(chatData, 'plan');
        const chatPlan = normalizeChatPlan(chatData.plan);
        const downvotedRunKeys = new Set<string>();
        const runs = Array.isArray(chatData.runs) ? chatData.runs : [];
        for (const rawRun of runs) {
          if (!isObjectRecord(rawRun)) continue;
          if (String(rawRun.feedbackType || '').trim() !== 'thumbs_down') continue;
          const runId = String(rawRun.runId || '').trim();
          if (runId) {
            downvotedRunKeys.add(runId);
          }
        }

        /* Replay events into a LOCAL MUTABLE state to avoid React batching issues */
        const events = Array.isArray(chatData?.events) ? chatData.events : [];
        const rs = createReplayState();
        rs.chatId = chatId;

        for (const event of events) {
          if (seq !== loadSeqRef.current) return;
          const evt = event as AgentEvent;
          if (evt?.chatId && String(evt.chatId) !== String(chatId)) continue;
          replayEvent(rs, evt);
        }

        if (chatArtifacts !== undefined) {
          setReplayArtifacts(rs, chatArtifacts);
        }

        if (hasPlanSnapshot && chatPlan !== undefined) {
          setReplayPlan(rs, chatPlan, {
            resetRuntime: !chatPlan
              || Boolean(rs.plan?.planId && chatPlan.planId && rs.plan.planId !== chatPlan.planId),
          });
        }

        flushSync(() => {
          applyLoadedChatState(chatId);

          /* Dispatch the complete replay result as a single batch update */
          dispatch({
            type: 'BATCH_UPDATE',
            updates: {
              chatId: rs.chatId,
              runId: rs.runId,
              timelineNodes: rs.timelineNodes,
              timelineOrder: rs.timelineOrder,
              contentNodeById: rs.contentNodeById,
              reasoningNodeById: rs.reasoningNodeById,
              toolNodeById: rs.toolNodeById,
              toolStates: rs.toolStates,
              timelineCounter: rs.timelineCounter,
              activeReasoningKey: rs.activeReasoningKey,
              activeAwaiting: rs.activeAwaiting,
              events: rs.events,
              debugEvents: rs.debugEvents,
              artifacts: rs.artifacts,
              plan: rs.plan,
              planRuntimeByTaskId: rs.planRuntimeByTaskId,
              taskItemsById: rs.taskItemsById,
              activeTaskIds: rs.activeTaskIds,
              planCurrentRunningTaskId: rs.planCurrentRunningTaskId,
              planLastTouchedTaskId: rs.planLastTouchedTaskId,
              downvotedRunKeys,
            },
          });
        });
        if (usageSnapshot) {
          dispatch({ type: 'SET_USAGE_SNAPSHOT', snapshot: usageSnapshot });
        }

        /* Set agent for this chat */
        const agentKey = String(chatData?.firstAgentKey || chatData?.agentKey || '');
        if (agentKey) {
          dispatch({ type: 'SET_CHAT_AGENT_BY_ID', chatId, agentKey });
        }
        // Also set any agents discovered during replay
        rs.chatAgentById.forEach((agentKey, cid) => {
          dispatch({ type: 'SET_CHAT_AGENT_BY_ID', chatId: cid, agentKey });
        });
        const activeRun = isObjectRecord(chatData.activeRun)
          ? chatData.activeRun
          : null;
        const activeRunId = String(activeRun?.runId || '').trim();
        if (activeRunId) {
          const activeRunAgentKey = String(
            activeRun?.agentKey || chatData?.firstAgentKey || chatData?.agentKey || '',
          ).trim();
          if (activeRunAgentKey) {
            dispatch({
              type: 'SET_RUN_AGENT_BY_ID',
              runId: activeRunId,
              agentKey: activeRunAgentKey,
            });
            dispatch({
              type: 'SET_CURRENT_RUN_AGENT_KEY',
              agentKey: activeRunAgentKey,
            });
          }
          dispatchAttachRunEvent(
            chatId,
            activeRunId,
            normalizeAttachLastSeq(activeRun?.lastSeq),
            activeRunAgentKey,
          );
        }

        /* Restore planning mode from active run if no explicit user preference,
           unless replay encountered awaiting.ask (agent is waiting for user input) */
        if (rs.activeAwaiting) {
          dispatch({
            type: 'SET_PLANNING_MODE',
            chatId,
            enabled: false,
            persist: true,
          });
        } else if (activeRun && activeRun.planningMode && stateRef.current.planningModeByChatId[chatId] === undefined) {
          dispatch({
            type: 'SET_PLANNING_MODE',
            chatId,
            enabled: true,
            persist: false,
          });
        }
        if (focusComposerOnComplete) {
          focusComposerSoon();
        }
      } catch (error) {
        dispatch({ type: 'APPEND_DEBUG', line: `[loadChat error] ${(error as Error).message}` });
        if (focusComposerOnComplete) {
          focusComposerSoon();
        }
      }
    },
    [
      clearArtifactAutoCollapseTimer,
      clearPlanAutoCollapseTimer,
      detachActiveConversationSession,
      dispatchDetachActiveRun,
      dispatch,
      focusComposerSoon,
      applyLoadedChatState,
      stateRef,
    ]
  );

  const selectWorkerConversation = useCallback(async (
    workerKey: string,
    options: { focusComposerOnComplete?: boolean; preferNewChat?: boolean } = {},
  ) => {
    const normalized = String(workerKey || '').trim();
    if (!normalized) return;
    const focusComposerOnComplete = Boolean(options.focusComposerOnComplete);
    const preferNewChat = Boolean(options.preferNewChat);

    const row = stateRef.current.workerIndexByKey.get(normalized) as WorkerRow | undefined;
    if (!row) return;
    const pendingAgentKey =
      row.type === 'agent' ? String(row.sourceId || '').trim() : '';

    dispatch({ type: 'SET_WORKER_SELECTION_KEY', workerKey: normalized });
    const workerChats = buildWorkerConversationRows({
      chats: stateRef.current.chats,
      worker: row,
    });
    dispatch({ type: 'SET_WORKER_RELATED_CHATS', chats: workerChats });
    dispatch({
      type: 'SET_WORKER_CHAT_PANEL_COLLAPSED',
      collapsed: true,
    });

    const appendNoHistoryDebug = () => {
      dispatch({
        type: 'APPEND_DEBUG',
        line: `[worker] ${row.type === 'team' ? '小组' : '员工'} ${row.displayName} 暂无历史对话，发送首条消息将创建新对话`,
      });
    };

    if (preferNewChat) {
      const runningChat = workerChats.find(isChatActiveRun);
      const latestChat = workerChats[0];
      const targetChat = runningChat || (
        isWorkerAttentionChat(latestChat) ? latestChat : undefined
      );
      const targetChatId = String(targetChat?.chatId || '').trim();
      if (targetChatId) {
        await loadChat(targetChatId, { focusComposerOnComplete });
        return;
      }

      activateBlankConversation({
        preserveWorkerContext: true,
        focusComposerOnComplete,
      });
      dispatch({ type: 'SET_PENDING_NEW_CHAT_AGENT_KEY', agentKey: pendingAgentKey });
      dispatch({
        type: 'SET_WORKER_PRIORITY_KEY',
        workerKey: pendingAgentKey ? normalized : '',
      });
      if (!row.hasHistory || !row.latestChatId) {
        appendNoHistoryDebug();
      }
      return;
    }

    if (row.hasHistory && row.latestChatId) {
      await loadChat(row.latestChatId, { focusComposerOnComplete });
      return;
    }

    activateBlankConversation({
      preserveWorkerContext: true,
      focusComposerOnComplete,
    });
    dispatch({ type: 'SET_PENDING_NEW_CHAT_AGENT_KEY', agentKey: pendingAgentKey });
    dispatch({
      type: 'SET_WORKER_PRIORITY_KEY',
      workerKey: pendingAgentKey ? normalized : '',
    });
    appendNoHistoryDebug();
  }, [activateBlankConversation, dispatch, loadChat, stateRef]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = normalizeStartNewConversationDetail(
        ((event as CustomEvent).detail || {}) as StartNewConversationDetail,
        stateRef.current.conversationMode,
      );
      if (detail.agentKey) {
        const workerKey = `agent:${detail.agentKey}`;
        dispatch({ type: 'SET_CONVERSATION_MODE', mode: 'worker' });
        dispatch({ type: 'SET_WORKER_SELECTION_KEY', workerKey });
        dispatch({ type: 'SET_WORKER_PRIORITY_KEY', workerKey });
      }
      activateBlankConversation({
        preserveWorkerContext: detail.preserveWorkerContext,
        focusComposerOnComplete: detail.focusComposerOnComplete,
      });
      if (detail.agentKey) {
        dispatch({ type: 'SET_PENDING_NEW_CHAT_AGENT_KEY', agentKey: detail.agentKey });
      }
    };
    window.addEventListener('agent:start-new-conversation', handler);
    return () => window.removeEventListener('agent:start-new-conversation', handler);
  }, [activateBlankConversation, dispatch, stateRef]);

  const workerData = useWorkerData({ loadChat, selectWorkerConversation });

  return {
    ...workerData,
    activateBlankConversation,
    loadChat,
    selectWorkerConversation,
  };
}
