import { useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useAppContext } from '@/app/state/AppContext';
import { getChat, markChatRead } from '@/features/transport/lib/apiClientProxy';
import type { ArtifactFile, Chat, AgentEvent, Plan, PublishedArtifact, WorkerRow } from '@/app/state/types';
import { normalizeChatReadState, upsertAgentUnreadCount } from '@/features/chats/lib/chatReadState';
import { createWorkerKeyFromChat } from '@/features/workers/lib/workerListFormatter';
import { buildWorkerConversationRows } from '@/features/workers/lib/workerConversationFormatter';
import { useWorkerData } from '@/features/workers/hooks/useWorkerData';
import {
  applyPendingSessionUpdates,
  buildConversationStateUpdates,
  markSessionSnapshotApplied,
  snapshotConversationState,
} from '@/features/chats/lib/conversationSession';
import { createReplayState, replayEvent, setReplayArtifacts, setReplayPlan, type ReplayState } from '@/features/chats/lib/conversationReplay';

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

function dispatchAttachRunEvent(chatId: string, runId: string, lastSeq = 0): void {
  if (
    typeof window === 'undefined'
    || typeof window.dispatchEvent !== 'function'
    || typeof CustomEvent !== 'function'
  ) {
    return;
  }
  window.dispatchEvent(
    new CustomEvent('agent:attach-run', {
      detail: { chatId, runId, lastSeq },
    }),
  );
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

/**
 * useChatActions — handles loading agents, chats, and switching chat context.
 */
export function useChatActions() {
  const {
    dispatch,
    stateRef,
    querySessionsRef,
    chatQuerySessionIndexRef,
    activeQuerySessionRequestIdRef,
  } = useAppContext();
  const loadSeqRef = useRef(0);

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

    activeQuerySessionRequestIdRef.current = '';
    return session;
  }, [activeQuerySessionRequestIdRef, querySessionsRef, stateRef]);

  const activateBlankConversation = useCallback((options: {
    preserveWorkerContext?: boolean;
    focusComposerOnComplete?: boolean;
  } = {}) => {
    const preserveWorkerContext = Boolean(options.preserveWorkerContext);
    const focusComposerOnComplete = Boolean(options.focusComposerOnComplete);

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
  }, [clearArtifactAutoCollapseTimer, clearPlanAutoCollapseTimer, detachActiveConversationSession, dispatch, focusComposerSoon]);

  const restoreSessionConversation = useCallback((chatId: string): boolean => {
    const requestId = String(chatQuerySessionIndexRef.current.get(chatId) || '').trim();
    if (!requestId) {
      return false;
    }

    const session = querySessionsRef.current.get(requestId) || null;
    if (!session?.snapshot) {
      return false;
    }

    const restored = applyPendingSessionUpdates(session.snapshot, session);
    session.snapshot = restored;
    session.streaming = restored.streaming;
    session.abortController = restored.abortController;
    markSessionSnapshotApplied(session);

    clearArtifactAutoCollapseTimer();
    clearPlanAutoCollapseTimer();
    window.dispatchEvent(new CustomEvent('agent:voice-reset'));
    flushSync(() => {
      dispatch({
        type: 'BATCH_UPDATE',
        updates: buildConversationStateUpdates(restored),
      });
    });
    window.dispatchEvent(new CustomEvent('agent:reset-event-cache'));
    activeQuerySessionRequestIdRef.current = session.requestId;
    return true;
  }, [
    activeQuerySessionRequestIdRef,
    chatQuerySessionIndexRef,
    clearArtifactAutoCollapseTimer,
    clearPlanAutoCollapseTimer,
    dispatch,
    querySessionsRef,
  ]);

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

  const loadChat = useCallback(
    async (chatId: string, options: { focusComposerOnComplete?: boolean } = {}) => {
      if (!chatId) return;
      const focusComposerOnComplete = Boolean(options.focusComposerOnComplete);

      const seq = ++loadSeqRef.current;
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

      if (restoreSessionConversation(chatId)) {
        void autoMarkReadIfNeeded(currentChat);
        if (focusComposerOnComplete) {
          focusComposerSoon();
        }
        return;
      }

      try {
        const response = await getChat(chatId, false);
        if (seq !== loadSeqRef.current) return;

        const chatData = response.data as Record<string, unknown>;
        const chatArtifacts = normalizeChatArtifactItems(chatData.artifact);
        const hasPlanSnapshot = Object.prototype.hasOwnProperty.call(chatData, 'plan');
        const chatPlan = normalizeChatPlan(chatData.plan);

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
            artifacts: rs.artifacts,
            plan: rs.plan,
            planRuntimeByTaskId: rs.planRuntimeByTaskId,
            taskItemsById: rs.taskItemsById,
            taskGroupsById: rs.taskGroupsById,
            activeTaskIds: rs.activeTaskIds,
            agentGroupsByGroupId: rs.agentGroupsByGroupId,
            groupIdByTaskId: rs.groupIdByTaskId,
            groupIdByMainToolId: rs.groupIdByMainToolId,
            planCurrentRunningTaskId: rs.planCurrentRunningTaskId,
            planLastTouchedTaskId: rs.planLastTouchedTaskId,
          },
        });

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
          dispatchAttachRunEvent(chatId, activeRunId, 0);
        }
        void autoMarkReadIfNeeded(currentChat);
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
      dispatch,
      focusComposerSoon,
      autoMarkReadIfNeeded,
      applyLoadedChatState,
      restoreSessionConversation,
      stateRef,
    ]
  );

  const selectWorkerConversation = useCallback(async (
    workerKey: string,
    options: { focusComposerOnComplete?: boolean } = {},
  ) => {
    const normalized = String(workerKey || '').trim();
    if (!normalized) return;
    const focusComposerOnComplete = Boolean(options.focusComposerOnComplete);

    const row = stateRef.current.workerIndexByKey.get(normalized) as WorkerRow | undefined;
    if (!row) return;

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

    if (row.hasHistory && row.latestChatId) {
      await loadChat(row.latestChatId, { focusComposerOnComplete });
      return;
    }

    activateBlankConversation({
      preserveWorkerContext: true,
      focusComposerOnComplete,
    });
    dispatch({
      type: 'APPEND_DEBUG',
      line: `[worker] ${row.type === 'team' ? '小组' : '员工'} ${row.displayName} 暂无历史对话，发送首条消息将创建新对话`,
    });
  }, [activateBlankConversation, dispatch, loadChat, stateRef]);

  useEffect(() => {
    const handler = (event: Event) => {
      const focusComposerOnComplete = Boolean((event as CustomEvent).detail?.focusComposerOnComplete);
      activateBlankConversation({
        preserveWorkerContext: stateRef.current.conversationMode === 'worker',
        focusComposerOnComplete,
      });
    };
    window.addEventListener('agent:start-new-conversation', handler);
    return () => window.removeEventListener('agent:start-new-conversation', handler);
  }, [activateBlankConversation, stateRef]);

  const workerData = useWorkerData({ loadChat, selectWorkerConversation });

  return {
    ...workerData,
    activateBlankConversation,
    loadChat,
    selectWorkerConversation,
  };
}
