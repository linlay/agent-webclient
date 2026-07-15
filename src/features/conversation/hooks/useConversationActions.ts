import { useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useAppContext } from '@/app/state/AppContext';
import { getChat } from '@/shared/data';
import type {
  Chat,
  CurrentChatActiveRun,
  AgentEvent,
  WorkerRow,
} from '@/app/state/types';
import { createWorkerKeyFromChat } from '@/features/workers/lib/workerListFormatter';
import { buildWorkerConversationRows } from '@/features/workers/lib/workerConversationFormatter';
import {
  markSessionSnapshotApplied,
  snapshotConversationState,
} from '@/features/conversation/lib/conversationSession';
import { resolveMainChatRuntime } from '@/features/runs/lib/runRuntimeState';
import { resolveRunOwner } from '@/features/runs/lib/runOwner';
import { toRunOwner, type RunOwner } from '@/shared/data/runOwner';
import { createReplayState, replayEvent, setReplayArtifacts, setReplayPlan } from '@/features/conversation/lib/conversationReplay';
import {
  buildLoadedChatUsageSnapshot,
  normalizeChatArtifactItems,
  normalizeLoadedChatEvents,
  normalizeChatPlan,
} from '@/features/conversation/lib/conversationPayload';
import { dispatchDetachRunEvent, type DetachRunReason } from '@/features/runs/lib/runControlEvents';

/**
 * Replay state — mutable structure used during synchronous event replay.
 * Avoids React batching issues by building up the full timeline locally,
 * then dispatching the complete result via BATCH_UPDATE.
 */
export type { ReplayState } from '@/features/conversation/lib/conversationReplay';
export { createReplayState, replayEvent, setReplayArtifacts, setReplayPlan } from '@/features/conversation/lib/conversationReplay';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

export interface StartNewConversationDetail {
  agentKey?: unknown;
  preserveWorkerContext: unknown;
  focusComposerOnComplete: unknown;
}

export function normalizeStartNewConversationDetail(
  detail: StartNewConversationDetail | null | undefined,
): {
  agentKey: string;
  preserveWorkerContext: boolean;
  focusComposerOnComplete: boolean;
} | null {
  if (!isObjectRecord(detail)) return null;
  if (!Object.prototype.hasOwnProperty.call(detail, 'preserveWorkerContext')) {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(detail, 'focusComposerOnComplete')) {
    return null;
  }

  const agentKey = String(detail.agentKey || '').trim();
  return {
    agentKey,
    preserveWorkerContext: detail.preserveWorkerContext === true,
    focusComposerOnComplete: detail.focusComposerOnComplete === true,
  };
}

function dispatchAttachRunEvent(chatId: string, runId: string, lastSeq = 0, owner: RunOwner | null = null): void {
  if (
    typeof window === 'undefined'
    || typeof window.dispatchEvent !== 'function'
    || typeof CustomEvent !== 'function'
  ) {
    return;
  }
  window.dispatchEvent(
    new CustomEvent('agent:attach-run', {
      detail: {
        chatId,
        runId,
        lastSeq,
        ...(owner?.kind === 'agent' ? { agentKey: owner.agentKey } : {}),
        ...(owner?.kind === 'orchestrated-team' ? { teamId: owner.teamId } : {}),
        ...(owner ? { owner } : {}),
      },
    }),
  );
}

function maybeDispatchDetachRunEvent(detail: {
  chatId?: string;
  runId?: string;
  agentKey?: string;
  owner?: RunOwner;
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
    owner: detail.owner,
    reason: detail.reason,
  });
  return true;
}

function normalizeAttachLastSeq(value: unknown): number {
  const seq = Number(value ?? 0);
  return Number.isFinite(seq) && seq >= 0 ? seq : 0;
}

function normalizeCurrentChatActiveRun(
  chatId: string,
  activeRun: Record<string, unknown> | null,
  owner: RunOwner | null,
): CurrentChatActiveRun | null {
  const normalizedChatId = String(chatId || '').trim();
  const runId = String(activeRun?.runId || '').trim();
  if (!normalizedChatId || !activeRun || !runId) {
    return null;
  }
  return {
    ...activeRun,
    chatId: normalizedChatId,
    runId,
    ...(owner?.kind === 'agent' ? { agentKey: owner.agentKey } : {}),
    ...(owner?.kind === 'orchestrated-team' ? { teamId: owner.teamId } : {}),
    ...(owner ? { owner } : {}),
  };
}

const LOAD_CHAT_RETRY_DELAYS_MS = [180, 420, 800] as const;
const ACTIVE_CHAT_REFRESH_DELAYS_MS = [2000, 8000, 20000] as const;

function waitForLoadChatRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
}

function hasAssistantTimelineContentInState(state: {
  timelineOrder: string[];
  timelineNodes: Map<string, { kind?: string; role?: string }>;
}): boolean {
  return state.timelineOrder.some((nodeId) => {
    const node = state.timelineNodes.get(nodeId);
    return Boolean(node && (node.kind !== 'message' || node.role !== 'user'));
  });
}

function hasContentTimelineTextInState(state: {
  timelineOrder: string[];
  timelineNodes: Map<string, { kind?: string; text?: string }>;
}): boolean {
  return state.timelineOrder.some((nodeId) => {
    const node = state.timelineNodes.get(nodeId);
    return Boolean(
      node &&
      node.kind === 'content' &&
      String(node.text || '').trim(),
    );
  });
}

/**
 * useConversationActions — handles loading agents, chats, and switching chat context.
 */
export function useConversationActions() {
  const {
    dispatch,
    stateRef,
    querySessionsRef,
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
    if (!session?.streaming) {
      return;
    }

    const runId = String(session?.runId || state.runId || '').trim();
    const owner = resolveRunOwner({
      chatId,
      chats: state.chats,
      sessionOwner: session?.owner,
      fallbackOwner: toRunOwner({
        agentKey: session?.agentKey || state.runAgentById.get(runId) || state.currentRunAgentKey,
      }),
    });
    if (owner && maybeDispatchDetachRunEvent({ chatId, runId, owner, ...(owner.kind === 'agent' ? { agentKey: owner.agentKey } : {}), reason })) {
      return;
    }

    dispatch({
      type: 'APPEND_DEBUG',
      line: `[detach] skipped: missing runId or owner (chatId=${chatId || '-'})`,
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

  const loadChat = useCallback(
    async (chatId: string, options: { focusComposerOnComplete?: boolean } = {}) => {
      if (!chatId) return;
      const focusComposerOnComplete = Boolean(options.focusComposerOnComplete);
      const currentChatId = String(stateRef.current.chatId || '').trim();
      const mainRuntime = resolveMainChatRuntime(
        stateRef,
        activeQuerySessionRequestIdRef,
        querySessionsRef,
      );
      const hasAssistantTimelineContent = hasAssistantTimelineContentInState(stateRef.current);
      if (
        currentChatId
        && currentChatId === chatId
        && mainRuntime.running
        && hasAssistantTimelineContent
      ) {
        if (focusComposerOnComplete) {
          focusComposerSoon();
        }
        return;
      }

      const seq = ++loadSeqRef.current;
      const loadingCurrentChat = Boolean(currentChatId && currentChatId === chatId);
      if (!loadingCurrentChat) {
        dispatchDetachActiveRun('chat_switch', chatId);
        detachActiveConversationSession();
      }

      if (!loadingCurrentChat && currentChatId && currentChatId !== chatId) {
        dispatch({ type: 'CLEAR_EVENTS' });
      }

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

      dispatch({ type: 'SET_STREAMING', streaming: true });

      try {
        let response: Awaited<ReturnType<typeof getChat>> | null = null;
        let lastLoadError: unknown = null;
        for (let attempt = 0; attempt <= LOAD_CHAT_RETRY_DELAYS_MS.length; attempt += 1) {
          try {
            response = await getChat(chatId, false);
            lastLoadError = null;
            break;
          } catch (error) {
            lastLoadError = error;
            if (seq !== loadSeqRef.current || attempt >= LOAD_CHAT_RETRY_DELAYS_MS.length) {
              break;
            }
            await waitForLoadChatRetry(LOAD_CHAT_RETRY_DELAYS_MS[attempt]);
          }
        }
        if (!response) {
          throw lastLoadError instanceof Error ? lastLoadError : new Error(String(lastLoadError || 'failed to load chat'));
        }
        if (seq !== loadSeqRef.current) return;

        const chatData = response.data as Record<string, unknown>;
        const chatArtifacts = normalizeChatArtifactItems(chatData.artifact);
        const usageSnapshot = buildLoadedChatUsageSnapshot(chatId, chatData);
        const hasPlanSnapshot = Object.prototype.hasOwnProperty.call(chatData, 'plan');
        const chatPlan = normalizeChatPlan(chatData.plan);
        const activeRun = isObjectRecord(chatData.activeRun)
          ? chatData.activeRun
          : null;
        const loadedOwner = resolveRunOwner({
          chatId,
          chats: stateRef.current.chats,
          eventIdentity: {
            teamId: activeRun?.teamId || chatData.teamId,
            agentKey: activeRun?.agentKey || chatData.firstAgentKey || chatData.agentKey,
          },
        }) || toRunOwner(chatData);
        const activeRunAgentKey = loadedOwner?.kind === 'agent' ? loadedOwner.agentKey : '';
        const currentChatActiveRun = normalizeCurrentChatActiveRun(
          chatId,
          activeRun,
          loadedOwner,
        );
        const activeRunId = String(currentChatActiveRun?.runId || '').trim();
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
        const rawEvents = Array.isArray(chatData?.events) ? chatData.events : [];
        const events = normalizeLoadedChatEvents(rawEvents);
        if (events.length !== rawEvents.length) {
          dispatch({
            type: 'APPEND_DEBUG',
            line: '[time_contract_violation] ignored malformed /api/chat replay event timestamp',
          });
        }
        const rs = createReplayState();
        rs.chatId = chatId;

        for (const evt of events) {
          if (seq !== loadSeqRef.current) return;
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
              currentChatActiveRun,
              runId: activeRunId || rs.runId,
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
              fileChanges: rs.fileChanges,
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
        const replayHasContentTimelineText = hasContentTimelineTextInState(rs);
        if (activeRunId && !replayHasContentTimelineText) {
          for (const delayMs of ACTIVE_CHAT_REFRESH_DELAYS_MS) {
            const refreshTimer = globalThis.setTimeout(() => {
              const latestState = stateRef.current;
              if (String(latestState.chatId || '').trim() !== chatId) {
                return;
              }
              if (hasContentTimelineTextInState(latestState)) {
                return;
              }
              window.dispatchEvent(
                new CustomEvent('agent:load-chat', {
                  detail: { chatId },
                }),
              );
            }, delayMs);
            (refreshTimer as { unref?: () => void }).unref?.();
          }
        }
        if (usageSnapshot) {
          dispatch({ type: 'SET_USAGE_SNAPSHOT', snapshot: usageSnapshot });
        }

        /* Set agent for this chat */
        const agentKey = loadedOwner?.kind === 'agent'
          ? loadedOwner.agentKey
          : '';
        if (agentKey) {
          dispatch({ type: 'SET_CHAT_AGENT_BY_ID', chatId, agentKey });
        }
        // Also set any agents discovered during replay
        if (loadedOwner?.kind !== 'orchestrated-team') {
          rs.chatAgentById.forEach((agentKey, cid) => {
            dispatch({ type: 'SET_CHAT_AGENT_BY_ID', chatId: cid, agentKey });
          });
        }
        if (activeRunId) {
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
            loadedOwner,
          );
        }

        /* Restore planning mode from active run if no explicit user preference,
           unless replay encountered awaiting.ask (agent is waiting for user input) */
        if (rs.activeAwaiting && rs.activeAwaiting.mode !== 'plan') {
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
        if (!activeRunId) {
          dispatch({ type: 'SET_STREAMING', streaming: false });
        }
      } catch (error) {
        dispatch({ type: 'APPEND_DEBUG', line: `[loadChat error] ${(error as Error).message}` });
        dispatch({ type: 'SET_STREAMING', streaming: false });
        if (focusComposerOnComplete) {
          focusComposerSoon();
        }
      }
    },
    [
      clearArtifactAutoCollapseTimer,
      clearPlanAutoCollapseTimer,
      activeQuerySessionRequestIdRef,
      detachActiveConversationSession,
      dispatchDetachActiveRun,
      dispatch,
      focusComposerSoon,
      applyLoadedChatState,
      querySessionsRef,
      stateRef,
    ]
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = normalizeStartNewConversationDetail(
        (event as CustomEvent).detail as StartNewConversationDetail | null | undefined,
      );
      if (!detail) {
        dispatch({
          type: 'APPEND_DEBUG',
          line: '[new conversation] ignored: missing explicit detail',
        });
        return;
      }
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

  return {
    activateBlankConversation,
    loadChat,
  };
}
