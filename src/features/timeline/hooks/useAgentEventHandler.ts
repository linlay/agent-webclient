import { useCallback, useEffect, useRef } from 'react';
import { useAppContext } from '@/app/state/AppContext';
import type {
  AgentEvent,
  AppState,
  UiTimerHandle,
} from '@/app/state/types';
import { upsertLiveChatSummary as buildLiveChatSummary } from '@/features/chats/lib/chatSummaryLive';
import { processEvent } from '@/features/timeline/lib/eventProcessor';
import { readEventTeamId, readRequestQueryText } from '@/shared/utils/eventFieldReaders';
import { toText } from '@/shared/utils/eventUtils';
import {
  ARTIFACT_AUTO_COLLAPSE_MS,
  FRONTEND_VIEWPORT_TYPES,
  PLAN_AUTO_COLLAPSE_MS,
  REASONING_AUTO_COLLAPSE_MS,
} from '@/app/state/constants';
import {
  clearReasoningAutoCollapseTimer,
  scheduleReasoningAutoCollapseTimer,
} from '@/features/timeline/lib/reasoningAutoCollapse';
import { getVoiceRuntime } from '@/features/voice/lib/voiceRuntime';
import { stripSpecialBlocksFromText } from '@/features/timeline/lib/contentSegments';
import { reduceActiveAwaiting } from '@/features/tools/lib/awaitingRuntime';
import {
  createLiveProcessorState,
  createLocalCache,
  createLocalCacheFromState,
  getCachedNodeText,
  shouldSyncLiveCache,
  type LocalCache,
} from '@/features/timeline/lib/localEventCache';
import {
  applyLiveEventCommand,
  findMatchingPendingSteer,
} from '@/features/timeline/lib/eventDispatchHandlers';

export {
  createLiveProcessorState,
  createLocalCacheFromState,
  shouldSyncLiveCache,
} from '@/features/timeline/lib/localEventCache';
export {
  findMatchingPendingSteer,
} from '@/features/timeline/lib/eventDispatchHandlers';

function resolveSelectedWorkerContext(state: AppState): { agentKey: string; teamId: string } {
  const selectedWorker = state.workerIndexByKey.get(toText(state.workerSelectionKey)) || null;
  if (!selectedWorker) {
    return { agentKey: '', teamId: '' };
  }
  if (selectedWorker.type === 'agent') {
    return {
      agentKey: toText(selectedWorker.sourceId),
      teamId: '',
    };
  }
  return {
    agentKey: '',
    teamId: toText(selectedWorker.sourceId),
  };
}

/**
 * useAgentEventHandler — processes incoming SSE events and updates state.
 * Uses a local mutable cache to track node IDs between React renders,
 * avoiding React 18 batching issues with rapid event processing.
 *
 * NOTE: request.query is NOT handled here — user messages during live
 * streaming are created by useMessageActions.sendMessage(). request.steer
 * is rendered here because the UI does not create a local optimistic node.
 * During history replay, both are handled by useChatActions.replayEvent().
 */
export function useAgentEventHandler() {
  const { dispatch, stateRef } = useAppContext();
  const cacheRef = useRef<LocalCache>(createLocalCache());

  /** Reset the local cache (called when conversation resets) */
  const resetCache = useCallback(() => {
    cacheRef.current = createLocalCache();
  }, []);

  const clearPlanAutoCollapse = useCallback(() => {
    const timer = stateRef.current.planAutoCollapseTimer;
    if (timer) {
      window.clearTimeout(timer);
      dispatch({ type: 'SET_PLAN_AUTO_COLLAPSE_TIMER', timer: null });
    }
  }, [dispatch, stateRef]);

  const clearArtifactAutoCollapse = useCallback(() => {
    const timer = stateRef.current.artifactAutoCollapseTimer;
    if (timer) {
      window.clearTimeout(timer);
      dispatch({ type: 'SET_ARTIFACT_AUTO_COLLAPSE_TIMER', timer: null });
    }
  }, [dispatch, stateRef]);

  useEffect(() => {
    const handler = () => {
      resetCache();
    };
    window.addEventListener('agent:reset-event-cache', handler);
    return () => window.removeEventListener('agent:reset-event-cache', handler);
  }, [resetCache]);

  const schedulePlanAutoCollapse = useCallback(() => {
    clearPlanAutoCollapse();
    const timer: UiTimerHandle = window.setTimeout(() => {
      dispatch({ type: 'SET_PLAN_EXPANDED', expanded: false });
      dispatch({ type: 'SET_PLAN_AUTO_COLLAPSE_TIMER', timer: null });
      dispatch({ type: 'SET_PLAN_MANUAL_OVERRIDE', override: null });
    }, PLAN_AUTO_COLLAPSE_MS);
    dispatch({ type: 'SET_PLAN_AUTO_COLLAPSE_TIMER', timer });
  }, [clearPlanAutoCollapse, dispatch]);

  const scheduleArtifactAutoCollapse = useCallback(() => {
    clearArtifactAutoCollapse();
    const timer: UiTimerHandle = window.setTimeout(() => {
      dispatch({ type: 'SET_ARTIFACT_EXPANDED', expanded: false });
      dispatch({ type: 'SET_ARTIFACT_AUTO_COLLAPSE_TIMER', timer: null });
      dispatch({ type: 'SET_ARTIFACT_MANUAL_OVERRIDE', override: null });
    }, ARTIFACT_AUTO_COLLAPSE_MS);
    dispatch({ type: 'SET_ARTIFACT_AUTO_COLLAPSE_TIMER', timer });
  }, [clearArtifactAutoCollapse, dispatch]);

  const expandPlanForUpdate = useCallback(() => {
    dispatch({ type: 'SET_PLAN_EXPANDED', expanded: true });
    dispatch({ type: 'SET_PLAN_MANUAL_OVERRIDE', override: null });
    schedulePlanAutoCollapse();
  }, [dispatch, schedulePlanAutoCollapse]);

  const expandArtifactForUpdate = useCallback(() => {
    dispatch({ type: 'SET_ARTIFACT_EXPANDED', expanded: true });
    dispatch({ type: 'SET_ARTIFACT_MANUAL_OVERRIDE', override: null });
    scheduleArtifactAutoCollapse();
  }, [dispatch, scheduleArtifactAutoCollapse]);

  const clearReasoningAutoCollapse = useCallback((reasoningKey: string) => {
    clearReasoningAutoCollapseTimer({
      reasoningId: reasoningKey,
      getState: () => stateRef.current,
      dispatch,
    });
  }, [dispatch, stateRef]);

  const scheduleReasoningAutoCollapse = useCallback((reasoningKey: string, nodeId: string) => {
    scheduleReasoningAutoCollapseTimer({
      reasoningId: reasoningKey,
      nodeId,
      delayMs: REASONING_AUTO_COLLAPSE_MS,
      getState: () => stateRef.current,
      dispatch,
    });
  }, [dispatch, stateRef]);

  const upsertLiveChatSummary = useCallback((input: {
    event: AgentEvent;
    cache: LocalCache;
    state: AppState;
    lastRunContent?: string;
  }) => {
    const next = buildLiveChatSummary({
      event: input.event,
      cache: {
        chatId: input.cache.chatId,
        runId: input.cache.runId,
        agentKey: input.cache.agentKey,
        teamId: input.cache.teamId,
      },
      state: input.state,
      selectedContext: resolveSelectedWorkerContext(input.state),
      lastRunContent: input.lastRunContent,
    });
    if (!next) {
      return;
    }

    input.cache.chatId = next.resolved.chatId;
    input.cache.runId = next.resolved.runId;
    input.cache.agentKey = next.resolved.agentKey;
    input.cache.teamId = next.resolved.teamId;

    dispatch({ type: 'UPSERT_CHAT', chat: next.chat });
  }, [dispatch]);

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      const state = stateRef.current;
      let cache = cacheRef.current;
      const type = toText(event.type);
      if (shouldSyncLiveCache(cache, state)) {
        cache = createLocalCacheFromState(state);
        cacheRef.current = cache;
      }

      // Sync counter from React state if it's ahead
      if (state.timelineCounter > cache.counter) {
        cache.counter = state.timelineCounter;
      }
      if (!state.streaming && !state.chatId && !event.chatId) {
        cache.chatId = '';
        cache.runId = '';
        cache.agentKey = '';
        cache.teamId = '';
      }

      dispatch({ type: 'PUSH_EVENT', event });
      dispatch({ type: 'APPEND_DEBUG', line: `[${new Date().toLocaleTimeString()}] ${type}` });

      const nextAwaiting = reduceActiveAwaiting(cache.activeAwaiting, event);
      if (nextAwaiting !== cache.activeAwaiting) {
        cache.activeAwaiting = nextAwaiting;
        dispatch({ type: 'SET_ACTIVE_AWAITING', awaiting: nextAwaiting });
      }

      if (type === 'request.query') {
        const text = readRequestQueryText(event);
        if (event.chatId) dispatch({ type: 'SET_CHAT_ID', chatId: event.chatId });
        if (event.agentKey && event.chatId) {
          dispatch({ type: 'SET_CHAT_AGENT_BY_ID', chatId: event.chatId, agentKey: String(event.agentKey) });
        }
        if (event.agentKey) {
          dispatch({ type: 'SET_WORKER_PRIORITY_KEY', workerKey: `agent:${String(event.agentKey)}` });
        }
        cache.chatId = toText(event.chatId) || toText(state.chatId);
        cache.runId = '';
        cache.agentKey = toText(event.agentKey) || toText(state.chatAgentById.get(cache.chatId)) || resolveSelectedWorkerContext(state).agentKey;
        cache.teamId = readEventTeamId(event) || resolveSelectedWorkerContext(state).teamId;
        upsertLiveChatSummary({
          event,
          cache,
          state,
          lastRunContent: type === 'request.query' ? text || undefined : undefined,
        });
        return;
      }

      if (type === 'request.steer') {
        const text = toText(event.message);
        const pendingSteer = findMatchingPendingSteer(state, event);
        const steerId = toText(event.steerId);
        if (!pendingSteer || !steerId || !text) {
          dispatch({
            type: 'APPEND_DEBUG',
            line: `[steer] ignored request.steer without pending match steerId=${steerId || '-'}`,
          });
          return;
        }
        dispatch({ type: 'REMOVE_PENDING_STEER', steerId });
      }

      const previousActiveReasoningKey = cache.activeReasoningKey || state.activeReasoningKey;
      const commands = processEvent(event, createLiveProcessorState(cache, state), {
        mode: 'live',
        reasoningExpandedDefault: true,
      });

      for (const command of commands) {
        applyLiveEventCommand({ command, cache, state, dispatch });
      }

      if (type === 'run.start') {
        cache.chatId = toText(event.chatId) || cache.chatId || toText(state.chatId);
        cache.runId = toText(event.runId) || cache.runId;
        cache.agentKey = toText(event.agentKey) || cache.agentKey || resolveSelectedWorkerContext(state).agentKey;
        cache.teamId = readEventTeamId(event) || cache.teamId || resolveSelectedWorkerContext(state).teamId;
        if (event.agentKey) {
          dispatch({ type: 'SET_WORKER_PRIORITY_KEY', workerKey: `agent:${String(event.agentKey)}` });
        }
        upsertLiveChatSummary({ event, cache, state });
        return;
      }

      if (type === 'run.error' || type === 'run.complete' || type === 'run.cancel') {
        upsertLiveChatSummary({ event, cache, state });
        dispatch({ type: 'SET_STREAMING', streaming: false });
        const isActiveVoiceRequest =
          state.inputMode === 'voice'
          && Boolean(state.voiceChat.activeRequestId)
          && state.voiceChat.activeRequestId === state.requestId;
        if (!isActiveVoiceRequest) {
          getVoiceRuntime()?.stopAllVoiceSessions(type, { mode: type === 'run.cancel' ? 'stop' : 'commit' });
        }
        return;
      }

      if (type === 'awaiting.ask' || type === 'awaiting.answer') {
        upsertLiveChatSummary({ event, cache, state });
        return;
      }

      if (
        (type === 'content.start' || type === 'content.delta' || type === 'content.end' || type === 'content.snapshot')
        && event.contentId
      ) {
        const contentId = String(event.contentId);
        const nodeId = cache.contentNodeById.get(contentId) ?? state.contentNodeById.get(contentId) ?? '';
        const text = nodeId ? getCachedNodeText(cache, state, nodeId) : '';
        const voiceStatus = type === 'content.end' || type === 'content.snapshot' ? 'completed' : 'running';
        const activeVoiceRequestId = String(state.voiceChat.activeRequestId || '').trim();
        const activeVoiceContentId = String(state.voiceChat.activeAssistantContentId || '').trim();
        const isVoiceRequestActive =
          state.inputMode === 'voice'
          && Boolean(activeVoiceRequestId)
          && activeVoiceRequestId === state.requestId;
        const shouldAttachVoiceContent =
          isVoiceRequestActive
          && (!activeVoiceContentId || activeVoiceContentId === contentId);
        if (shouldAttachVoiceContent && !activeVoiceContentId) {
          dispatch({
            type: 'PATCH_VOICE_CHAT',
            patch: { activeAssistantContentId: contentId },
          });
        }

        if (shouldAttachVoiceContent) {
          const spokenText = stripSpecialBlocksFromText(text || '');
          dispatch({
            type: 'PATCH_VOICE_CHAT',
            patch: {
              activeAssistantContentId: contentId,
              partialAssistantText: spokenText,
            },
          });
          if (spokenText) {
            void getVoiceRuntime()
              ?.syncVoiceChatSession(contentId, spokenText, {
                voice: state.voiceChat.selectedVoice,
                speechRate: state.voiceChat.speechRate,
              })
              .then((result) => {
                if (!result.appended) return;
                dispatch({
                  type: 'PATCH_VOICE_CHAT',
                  patch: {
                    status: 'speaking',
                    error: '',
                    activeTtsTaskId: result.taskId || state.voiceChat.activeTtsTaskId,
                    ttsCommitted: false,
                  },
                });
              })
              .catch((error) => {
                dispatch({
                  type: 'PATCH_VOICE_CHAT',
                  patch: {
                    status: 'error',
                    error: (error as Error).message,
                    sessionActive: false,
                  },
                });
              });
          }
        } else {
          getVoiceRuntime()?.processTtsVoiceBlocks(contentId, text, voiceStatus, 'live');
        }

        if (voiceStatus === 'completed') {
          upsertLiveChatSummary({
            event,
            cache,
            state,
            lastRunContent: text || undefined,
          });
        }
        return;
      }

      if (type === 'reasoning.start' || type === 'reasoning.delta') {
        if (cache.activeReasoningKey) {
          clearReasoningAutoCollapse(cache.activeReasoningKey);
        }
        return;
      }

      if (type === 'reasoning.end' || type === 'reasoning.snapshot') {
        const reasoningKey = toText(event.reasoningId) || previousActiveReasoningKey;
        const nodeId = reasoningKey
          ? (cache.reasoningNodeById.get(reasoningKey) ?? state.reasoningNodeById.get(reasoningKey) ?? '')
          : '';
        if (reasoningKey && nodeId) {
          scheduleReasoningAutoCollapse(reasoningKey, nodeId);
        }
        return;
      }

      if ((type === 'tool.start' || type === 'tool.snapshot' || type === 'tool.args') && event.toolId) {
        const toolId = String(event.toolId);
        const nextToolState = cache.toolStateById.get(toolId) ?? state.toolStates.get(toolId);
        if (type === 'tool.start' && nextToolState) {
          const toolType = String(nextToolState.toolType || '').trim().toLowerCase();
          if (nextToolState.viewportKey && FRONTEND_VIEWPORT_TYPES.has(toolType)) {
            dispatch({
              type: 'SET_ACTIVE_FRONTEND_TOOL',
              tool: {
                key: `${nextToolState.runId || ''}#${toolId}`,
                runId: nextToolState.runId || '',
                toolId,
                viewportKey: nextToolState.viewportKey,
                toolType,
                toolLabel: nextToolState.toolLabel || '',
                toolName: nextToolState.toolName || '',
                description: nextToolState.description || '',
                toolTimeout: nextToolState.toolTimeout ?? null,
                toolParams: nextToolState.toolParams || {},
                loading: false,
                loadError: '',
                viewportHtml: '',
              },
            });
          }
        }

        if (type === 'tool.args' && nextToolState?.toolParams) {
          const active = state.activeFrontendTool;
          const activeKey = `${nextToolState.runId || state.runId || ''}#${toolId}`;
          if (active && active.key === activeKey) {
            dispatch({
              type: 'SET_ACTIVE_FRONTEND_TOOL',
              tool: {
                ...active,
                toolLabel: nextToolState.toolLabel || active.toolLabel || '',
                toolName: nextToolState.toolName || active.toolName || '',
                toolParams: nextToolState.toolParams,
              },
            });
          }
        }
        return;
      }

      if (type === 'artifact.publish') {
        if (commands.length > 0) {
          expandArtifactForUpdate();
        }
        return;
      }

      if (type === 'plan.create' || type === 'plan.update' || type === 'task.start' || type === 'task.complete' || type === 'task.fail' || type === 'task.cancel') {
        if (commands.length > 0) {
          expandPlanForUpdate();
        }
        return;
      }
    },
    [
      clearReasoningAutoCollapse,
      dispatch,
      expandArtifactForUpdate,
      expandPlanForUpdate,
      scheduleReasoningAutoCollapse,
      stateRef,
      upsertLiveChatSummary,
    ]
  );

  return { handleEvent, resetCache };
}
