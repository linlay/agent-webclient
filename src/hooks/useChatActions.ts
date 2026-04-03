import { useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { getChat } from '../lib/apiClient';
import type { Chat, AgentEvent, Plan, WorkerRow } from '../context/types';
import { createWorkerKeyFromChat } from '../lib/workerListFormatter';
import { buildWorkerConversationRows } from '../lib/workerConversationFormatter';
import { useWorkerData } from './useWorkerData';
import {
  applyPendingSessionUpdates,
  buildConversationStateUpdates,
  markSessionSnapshotApplied,
  snapshotConversationState,
} from '../lib/conversationSession';
import { createReplayState, replayEvent, setReplayPlan, type ReplayState } from '../lib/conversationReplay';

/**
 * Replay state — mutable structure used during synchronous event replay.
 * Avoids React batching issues by building up the full timeline locally,
 * then dispatching the complete result via BATCH_UPDATE.
 */
export type { ReplayState } from '../lib/conversationReplay';
export { createReplayState, replayEvent, setReplayPlan } from '../lib/conversationReplay';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
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

  const focusComposerSoon = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('agent:focus-composer'));
    });
  }, []);

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
  }, [clearPlanAutoCollapseTimer, detachActiveConversationSession, dispatch, focusComposerSoon]);

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

    flushSync(() => {
      dispatch({
        type: 'BATCH_UPDATE',
        updates: buildConversationStateUpdates(restored),
      });
    });
    window.dispatchEvent(new CustomEvent('agent:reset-event-cache'));
    activeQuerySessionRequestIdRef.current = session.requestId;
    return true;
  }, [activeQuerySessionRequestIdRef, chatQuerySessionIndexRef, dispatch, querySessionsRef]);

  const loadChat = useCallback(
    async (chatId: string, options: { focusComposerOnComplete?: boolean } = {}) => {
      if (!chatId) return;
      const focusComposerOnComplete = Boolean(options.focusComposerOnComplete);

      const seq = ++loadSeqRef.current;
      detachActiveConversationSession();
      dispatch({ type: 'SET_CHAT_ID', chatId });
      clearPlanAutoCollapseTimer();
      dispatch({ type: 'RESET_CONVERSATION' });
      window.dispatchEvent(new CustomEvent('agent:reset-event-cache'));
      window.dispatchEvent(new CustomEvent('agent:voice-reset'));

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
        if (focusComposerOnComplete) {
          focusComposerSoon();
        }
        return;
      }

      try {
        const response = await getChat(chatId, false);
        if (seq !== loadSeqRef.current) return;

        const chatData = response.data as Record<string, unknown>;
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

        if (hasPlanSnapshot && chatPlan !== undefined) {
          setReplayPlan(rs, chatPlan, {
            resetRuntime: !chatPlan
              || Boolean(rs.plan?.planId && chatPlan.planId && rs.plan.planId !== chatPlan.planId),
          });
        }

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
            events: rs.events,
            plan: rs.plan,
            planRuntimeByTaskId: rs.planRuntimeByTaskId,
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
      clearPlanAutoCollapseTimer,
      detachActiveConversationSession,
      dispatch,
      focusComposerSoon,
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
