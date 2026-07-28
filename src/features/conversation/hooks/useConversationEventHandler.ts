import { useCallback, useEffect, useRef } from "react";
import { useAppContext } from "@/app/state/AppContext";
import {
  isAwaitingAnswerLike,
  isAwaitingAskLike,
  type AgentEvent,
  type AIUsageSnapshotEvent,
  type AppState,
  type UiTimerHandle,
} from "@/app/state/types";
import type { TimelineNode } from "@/app/state/timelineTypes";
import { upsertLiveChatSummary as buildLiveChatSummary } from "@/features/chats/lib/chatSummaryLive";
import { processStreamEvent } from "@/features/events/lib/eventProcessor";
import { isPlanViewEventType } from "@/features/plan/lib/planViewEvents";
import {
  readEventTeamId,
  readRequestQueryText,
} from "@/shared/utils/eventFieldReaders";
import { isTerminalStatus, toText } from "@/shared/utils/eventUtils";
import {
  ARTIFACT_AUTO_COLLAPSE_MS,
  FRONTEND_VIEWPORT_TYPES,
  PLAN_AUTO_COLLAPSE_MS,
  REASONING_AUTO_COLLAPSE_MS,
} from "@/app/state/constants";
import {
  clearReasoningAutoCollapseTimer,
  scheduleReasoningAutoCollapseTimer,
} from "@/features/timeline/lib/reasoningAutoCollapse";
import { getVoiceRuntime } from "@/features/voice/lib/voiceRuntime";
import { isVoiceEnabled } from "@/shared/config/featureFlags";
import { stripSpecialBlocksFromText } from "@/features/events/lib/contentSegments";
import { reduceAwaitingRuntime } from "@/features/tools/lib/awaitingRuntime";
import {
  getPlanningModeForPlanDecision,
  readPlanAnswerDecision,
} from "@/features/tools/lib/planDecision";
import {
  clearAwaitingSubmitId,
  readAwaitingSubmitId,
} from "@/features/tools/lib/awaitingSubmitTracker";
import {
  readRunAgentKeyFromEvent,
  resolveRunAgentKey,
} from "@/features/runs/lib/runAgentIdentity";
import { resolveRunOwner } from "@/features/runs/lib/runOwner";
import { toRunOwner } from "@/shared/data/runOwner";
import { resolveMainChatRuntime } from "@/features/runs/lib/runRuntimeState";
import {
  readExplicitEditingMode,
  resolveRunEditingMode,
} from "@/features/runs/lib/editingMode";
import {
  createLiveProcessorState,
  createLocalCache,
  createLocalCacheFromState,
  getCachedNodeText,
  shouldSyncLiveCache,
  type LocalCache,
} from "@/features/conversation/lib/liveEventCache";
import {
  applyLiveEventCommand,
} from "@/features/conversation/lib/liveEventDispatch";
import type { AgentEventSink } from "@/features/events/lib/eventSink";

export {
  createLiveProcessorState,
  createLocalCacheFromState,
  shouldSyncLiveCache,
} from "@/features/conversation/lib/liveEventCache";
export { findMatchingPendingSteer } from "@/features/conversation/lib/liveEventDispatch";

export function buildAwaitingPlanningModeAction(input: {
  event: AgentEvent;
  chatId: string;
  planningMode: boolean;
}) {
  const type = toText(input.event.type);
  const chatId = toText(input.chatId);
  if (!chatId) {
    return null;
  }

  if (isAwaitingAskLike(type)) {
    const awaitingMode = toText((input.event as Record<string, unknown>).mode);
    if (awaitingMode === "planning" || !input.planningMode) {
      return null;
    }
    return {
      type: "SET_PLANNING_MODE" as const,
      chatId,
      enabled: false,
      persist: true,
    };
  }

  if (isAwaitingAnswerLike(type)) {
    const planDecision = readPlanAnswerDecision(input.event);
    if (!planDecision) {
      return null;
    }
    return {
      type: "SET_PLANNING_MODE" as const,
      chatId,
      enabled: getPlanningModeForPlanDecision(planDecision),
      persist: true,
    };
  }

  return null;
}

function resolveSelectedWorkerContext(state: AppState): {
  agentKey: string;
  teamId: string;
} {
  const selectedWorker =
    state.workerIndexByKey.get(toText(state.workerSelectionKey)) || null;
  if (!selectedWorker) {
    return { agentKey: "", teamId: "" };
  }
  if (selectedWorker.type === "agent") {
    return {
      agentKey: toText(selectedWorker.sourceId),
      teamId: "",
    };
  }
  return {
    agentKey: "",
    teamId: toText(selectedWorker.sourceId),
  };
}

export function resolveAwaitingSubmitRuntimeContext(input: {
  event: AgentEvent;
  cache: LocalCache;
  state: AppState;
}): { awaitingRunId: string; awaitingId: string; pendingSubmitId: string } {
  const awaitingId = toText(input.event.awaitingId);
  const cachePendingAwaiting = awaitingId
    ? input.cache.pendingAwaitings.find((item) => item.awaitingId === awaitingId)
    : null;
  const statePendingAwaiting = awaitingId
    ? input.state.pendingAwaitings.find((item) => item.awaitingId === awaitingId)
    : null;
  const awaitingRunId =
    toText(input.event.runId) ||
    (awaitingId && input.cache.activeAwaiting?.awaitingId === awaitingId
      ? input.cache.activeAwaiting.runId
      : "") ||
    cachePendingAwaiting?.runId ||
    (awaitingId && input.state.activeAwaiting?.awaitingId === awaitingId
      ? input.state.activeAwaiting.runId
      : "") ||
    statePendingAwaiting?.runId ||
    input.cache.runId ||
    input.state.runId;
  const pendingSubmitId =
    awaitingRunId && awaitingId
      ? readAwaitingSubmitId(awaitingRunId, awaitingId)
      : "";
  return {
    awaitingRunId,
    awaitingId,
    pendingSubmitId,
  };
}

/**
 * useConversationEventHandler — processes incoming SSE events and updates state.
 * Uses a local mutable cache to track node IDs between React renders,
 * avoiding React 18 batching issues with rapid event processing.
 *
 * NOTE: request.query is NOT handled here — user messages during live
 * streaming are created by useMessageActions.sendMessage(). request.steer
 * is rendered here because the UI does not create a local optimistic node.
 * During history replay, both are handled by useConversationActions.replayEvent().
 */
export function useConversationEventHandler(): {
  handleEvent: AgentEventSink;
  resetCache: () => void;
} {
  const {
    dispatch,
    stateRef,
    querySessionsRef,
    activeQuerySessionRequestIdRef,
  } = useAppContext();
  const cacheRef = useRef<LocalCache>(createLocalCache());

  /** Reset the local cache (called when conversation resets) */
  const resetCache = useCallback(() => {
    cacheRef.current = createLocalCache();
  }, []);

  const clearPlanAutoCollapse = useCallback(() => {
    const timer = stateRef.current.planAutoCollapseTimer;
    if (timer) {
      window.clearTimeout(timer);
      dispatch({ type: "SET_PLAN_AUTO_COLLAPSE_TIMER", timer: null });
    }
  }, [dispatch, stateRef]);

  const clearArtifactAutoCollapse = useCallback(() => {
    const timer = stateRef.current.artifactAutoCollapseTimer;
    if (timer) {
      window.clearTimeout(timer);
      dispatch({ type: "SET_ARTIFACT_AUTO_COLLAPSE_TIMER", timer: null });
    }
  }, [dispatch, stateRef]);

  useEffect(() => {
    const handler = () => {
      resetCache();
    };
    window.addEventListener("agent:reset-event-cache", handler);
    return () => window.removeEventListener("agent:reset-event-cache", handler);
  }, [resetCache]);

  const schedulePlanAutoCollapse = useCallback(() => {
    clearPlanAutoCollapse();
    const timer: UiTimerHandle = window.setTimeout(() => {
      dispatch({ type: "SET_PLAN_EXPANDED", expanded: false });
      dispatch({ type: "SET_PLAN_AUTO_COLLAPSE_TIMER", timer: null });
      dispatch({ type: "SET_PLAN_MANUAL_OVERRIDE", override: null });
    }, PLAN_AUTO_COLLAPSE_MS);
    dispatch({ type: "SET_PLAN_AUTO_COLLAPSE_TIMER", timer });
  }, [clearPlanAutoCollapse, dispatch]);

  const scheduleArtifactAutoCollapse = useCallback(() => {
    clearArtifactAutoCollapse();
    const timer: UiTimerHandle = window.setTimeout(() => {
      dispatch({ type: "SET_ARTIFACT_EXPANDED", expanded: false });
      dispatch({ type: "SET_ARTIFACT_AUTO_COLLAPSE_TIMER", timer: null });
      dispatch({ type: "SET_ARTIFACT_MANUAL_OVERRIDE", override: null });
    }, ARTIFACT_AUTO_COLLAPSE_MS);
    dispatch({ type: "SET_ARTIFACT_AUTO_COLLAPSE_TIMER", timer });
  }, [clearArtifactAutoCollapse, dispatch]);

  const expandPlanForUpdate = useCallback(() => {
    dispatch({ type: "SET_PLAN_EXPANDED", expanded: true });
    dispatch({ type: "SET_PLAN_MANUAL_OVERRIDE", override: null });
    schedulePlanAutoCollapse();
  }, [dispatch, schedulePlanAutoCollapse]);

  const expandArtifactForUpdate = useCallback(() => {
    dispatch({ type: "SET_ARTIFACT_EXPANDED", expanded: true });
    dispatch({ type: "SET_ARTIFACT_MANUAL_OVERRIDE", override: null });
    scheduleArtifactAutoCollapse();
  }, [dispatch, scheduleArtifactAutoCollapse]);

  const clearReasoningAutoCollapse = useCallback(
    (reasoningKey: string) => {
      clearReasoningAutoCollapseTimer({
        reasoningId: reasoningKey,
        getState: () => stateRef.current,
        dispatch,
      });
    },
    [dispatch, stateRef],
  );

  const scheduleReasoningAutoCollapse = useCallback(
    (reasoningKey: string, nodeId: string) => {
      scheduleReasoningAutoCollapseTimer({
        reasoningId: reasoningKey,
        nodeId,
        delayMs: REASONING_AUTO_COLLAPSE_MS,
        getState: () => stateRef.current,
        dispatch,
      });
    },
    [dispatch, stateRef],
  );

  const upsertLiveChatSummary = useCallback(
    (input: {
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
          editingMode: input.cache.editingMode,
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
      input.cache.editingMode = next.resolved.editingMode;

      dispatch({ type: "UPSERT_CHAT", chat: next.chat });
    },
    [dispatch],
  );

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      const state = stateRef.current;
      let cache = cacheRef.current;
      const type = toText(event.type);
      const mainRuntime = resolveMainChatRuntime(
        stateRef,
        activeQuerySessionRequestIdRef,
        querySessionsRef,
      );
      if (shouldSyncLiveCache(cache, state, mainRuntime.streaming)) {
        cache = createLocalCacheFromState(state);
        cacheRef.current = cache;
      }

      // Sync counter from React state if it's ahead
      if (state.timelineCounter > cache.counter) {
        cache.counter = state.timelineCounter;
      }
      if (!mainRuntime.streaming && !state.chatId && !event.chatId) {
        cache.chatId = "";
        cache.runId = "";
        cache.agentKey = "";
        cache.teamId = "";
      }

      dispatch({ type: "PUSH_EVENT", event });
      dispatch({
        type: "APPEND_DEBUG",
        line: `[${new Date().toLocaleTimeString()}] ${type}`,
      });

      const eventChatId = toText(event.chatId) || cache.chatId || toText(state.chatId);
      const eventOwner = resolveRunOwner({
        chatId: eventChatId,
        chats: state.chats,
        currentRunOwner: state.currentChatActiveRun?.owner || toRunOwner(state.currentChatActiveRun),
        sessionOwner: mainRuntime.session?.owner,
        eventIdentity: { teamId: readEventTeamId(event), agentKey: event.agentKey },
        fallbackOwner: toRunOwner(resolveSelectedWorkerContext(state)),
      });
      const isTeamEventOwner = eventOwner?.kind === "orchestrated-team";

      const runAgentBinding = readRunAgentKeyFromEvent(event);
      if (runAgentBinding && !isTeamEventOwner) {
        const previousAgentKey = state.runAgentById.get(runAgentBinding.runId);
        if (previousAgentKey && previousAgentKey !== runAgentBinding.agentKey) {
          dispatch({
            type: "APPEND_DEBUG",
            line: `[run-agent] runId=${runAgentBinding.runId} agentKey changed ${previousAgentKey} -> ${runAgentBinding.agentKey}`,
          });
        }
        dispatch({
          type: "SET_RUN_AGENT_BY_ID",
          runId: runAgentBinding.runId,
          agentKey: runAgentBinding.agentKey,
        });
        if (
          !cache.runId ||
          cache.runId === runAgentBinding.runId ||
          toText(state.runId) === runAgentBinding.runId
        ) {
          dispatch({
            type: "SET_CURRENT_RUN_AGENT_KEY",
            agentKey: runAgentBinding.agentKey,
          });
          cache.agentKey = runAgentBinding.agentKey;
        }
      }

      if (type === "usage.snapshot") {
        dispatch({
          type: "SET_USAGE_SNAPSHOT",
          snapshot: event as AIUsageSnapshotEvent,
        });
        return;
      }

      const awaitingFallbackAgentKey = resolveRunAgentKey({
        runId: toText(event.runId) || cache.runId || state.runId,
        runAgentById: state.runAgentById,
        routingAgentKey: cache.agentKey,
        currentRunAgentKey: state.currentRunAgentKey,
        chatId: cache.chatId || toText(state.chatId),
        chatAgentById: state.chatAgentById,
        chats: state.chats,
        fallbackAgentKey: eventOwner?.kind === "agent" ? eventOwner.agentKey : "",
      });
      const {
        awaitingRunId,
        awaitingId,
        pendingSubmitId: pendingAwaitingSubmitId,
      } = resolveAwaitingSubmitRuntimeContext({ event, cache, state });
      const nextAwaitingRuntime = reduceAwaitingRuntime(
        {
          activeAwaiting: cache.activeAwaiting,
          pendingAwaitings: cache.pendingAwaitings,
        },
        event,
        {
          agentKey: awaitingFallbackAgentKey,
          ...(eventOwner ? { owner: eventOwner } : {}),
          pendingSubmitId: pendingAwaitingSubmitId,
        },
      );
      if (
        nextAwaitingRuntime.activeAwaiting !== cache.activeAwaiting ||
        nextAwaitingRuntime.pendingAwaitings !== cache.pendingAwaitings
      ) {
        cache.activeAwaiting = nextAwaitingRuntime.activeAwaiting;
        cache.pendingAwaitings = nextAwaitingRuntime.pendingAwaitings;
        dispatch({
          type: "SET_AWAITING_RUNTIME",
          activeAwaiting: nextAwaitingRuntime.activeAwaiting,
          pendingAwaitings: nextAwaitingRuntime.pendingAwaitings,
        });
      }
      if (isAwaitingAnswerLike(type) && awaitingRunId && awaitingId) {
        const submitId = toText((event as Record<string, unknown>).submitId);
        if (submitId && pendingAwaitingSubmitId === submitId) {
          clearAwaitingSubmitId(awaitingRunId, awaitingId);
        }
      }

      if (type === "request.query") {
        const text = readRequestQueryText(event);
        const requestEditingMode = readExplicitEditingMode(event);
        const sessionEditingMode =
          mainRuntime.session?.observationSource !== "attach" &&
          typeof mainRuntime.session?.editingMode === "boolean"
            ? mainRuntime.session.editingMode
            : undefined;
        if (sessionEditingMode !== undefined) {
          cache.editingMode = sessionEditingMode;
        } else if (requestEditingMode !== undefined) {
          cache.editingMode = requestEditingMode;
        }
        const currentActiveRun = state.currentChatActiveRun;
        if (
          requestEditingMode !== undefined &&
          currentActiveRun?.runId &&
          toText(currentActiveRun.runId) === toText(event.runId) &&
          readExplicitEditingMode(currentActiveRun) === undefined
        ) {
          dispatch({
            type: "SET_CURRENT_CHAT_ACTIVE_RUN",
            activeRun: {
              ...currentActiveRun,
              editingMode: requestEditingMode,
            },
          });
        }
        if (event.chatId)
          dispatch({ type: "SET_CHAT_ID", chatId: event.chatId });
        if (!isTeamEventOwner && event.agentKey && event.chatId) {
          dispatch({
            type: "SET_CHAT_AGENT_BY_ID",
            chatId: event.chatId,
            agentKey: String(event.agentKey),
          });
        }
        if (!isTeamEventOwner && event.agentKey) {
          dispatch({
            type: "SET_WORKER_PRIORITY_KEY",
            workerKey: `agent:${String(event.agentKey)}`,
          });
        }
        cache.chatId = toText(event.chatId) || toText(state.chatId);
        cache.runId = "";
        cache.agentKey = eventOwner?.kind === "agent" ? eventOwner.agentKey : "";
        cache.teamId = eventOwner?.kind === "orchestrated-team" ? eventOwner.teamId : "";
        upsertLiveChatSummary({
          event,
          cache,
          state,
          lastRunContent:
            type === "request.query" && !event.taskId
              ? text || undefined
              : undefined,
        });
        return;
      }

      if (type === "request.steer") {
        const text = toText(event.message);
        const steerId = toText(event.steerId);
        if (!steerId || !text) {
          dispatch({
            type: "APPEND_DEBUG",
            line: `[steer] ignored request.steer without valid steerId/text steerId=${steerId || "-"}`,
          });
          return;
        }
        dispatch({ type: "REMOVE_PENDING_STEER", steerId });
      }

      const previousActiveReasoningKey =
        cache.activeReasoningKey || state.activeReasoningKey;
      const commands = processStreamEvent(
        event,
        createLiveProcessorState(cache, state),
        {
          mode: "live",
          reasoningExpandedDefault: false,
        },
      );

      for (const command of commands) {
        applyLiveEventCommand({ command, cache, state, dispatch });
      }

      if (type === "run.start") {
        const runStartChatId = toText(event.chatId);
        if (runStartChatId && toText(state.chatId) !== runStartChatId) {
          dispatch({ type: "SET_CHAT_ID", chatId: runStartChatId });
        }
        if (!isTeamEventOwner && event.agentKey && runStartChatId) {
          dispatch({
            type: "SET_CHAT_AGENT_BY_ID",
            chatId: runStartChatId,
            agentKey: String(event.agentKey),
          });
        }
        cache.chatId =
          runStartChatId || cache.chatId || toText(state.chatId);
        cache.runId = toText(event.runId) || cache.runId;
        cache.agentKey = eventOwner?.kind === "agent" ? eventOwner.agentKey : "";
        cache.teamId = eventOwner?.kind === "orchestrated-team" ? eventOwner.teamId : "";
        const runEditingMode =
          resolveRunEditingMode({
            runId: cache.runId,
            session: mainRuntime.session,
            activeRun: state.currentChatActiveRun,
            events: [...state.events, event],
          }) ?? cache.editingMode;
        cache.editingMode = runEditingMode;
        if (cache.chatId && cache.runId) {
          dispatch({
            type: "SET_CURRENT_CHAT_ACTIVE_RUN",
            activeRun: {
              chatId: cache.chatId,
              runId: cache.runId,
              ...(cache.agentKey ? { agentKey: cache.agentKey } : {}),
              ...(cache.teamId ? { teamId: cache.teamId } : {}),
              ...(eventOwner ? { owner: eventOwner } : {}),
              ...(typeof runEditingMode === "boolean"
                ? { editingMode: runEditingMode }
                : {}),
            },
          });
        }
        dispatch({ type: "SET_EDITING_MODE", enabled: false });
        if (!isTeamEventOwner && event.agentKey) {
          dispatch({
            type: "SET_WORKER_PRIORITY_KEY",
            workerKey: `agent:${String(event.agentKey)}`,
          });
        }
        upsertLiveChatSummary({ event, cache, state });
        return;
      }

      if (
        type === "run.error" ||
        type === "run.complete" ||
        type === "run.cancel"
      ) {
        // 将仍处于非终结态的 tool 节点标记为 completed
        for (const [nodeId, node] of cache.nodeById) {
          if (node.kind === "tool" && !isTerminalStatus(node.status)) {
            const endedAt = node.endedAt ?? event.timestamp ?? Date.now();
            const completedNode: TimelineNode = {
              ...node,
              status: "completed",
              endedAt,
              durationMs:
                node.durationMs ??
                (node.startedAt != null
                  ? Math.max(0, endedAt - node.startedAt)
                  : undefined),
            };
            cache.nodeById.set(nodeId, completedNode);
            dispatch({
              type: "SET_TIMELINE_NODE",
              id: nodeId,
              node: completedNode,
            });
          }
        }

        upsertLiveChatSummary({ event, cache, state });
        const currentActiveRun = stateRef.current.currentChatActiveRun;
        const eventRunId = toText(event.runId);
        const eventChatId = toText(event.chatId);
        if (
          currentActiveRun?.runId &&
          currentActiveRun.runId === eventRunId &&
          (!eventChatId || currentActiveRun.chatId === eventChatId)
        ) {
          dispatch({ type: "SET_CURRENT_CHAT_ACTIVE_RUN", activeRun: null });
          cache.editingMode = undefined;
        }
        dispatch({ type: "SET_STREAMING", streaming: false });
        const voiceEnabled = isVoiceEnabled();
        const isActiveVoiceRequest =
          voiceEnabled &&
          state.inputMode === "voice" &&
          Boolean(state.voiceChat.activeRequestId) &&
          state.voiceChat.activeRequestId === state.requestId;
        if (!isActiveVoiceRequest) {
          getVoiceRuntime()?.stopAllVoiceSessions(type, {
            mode: type === "run.cancel" ? "stop" : "commit",
          });
        }
        if (type === "run.cancel") {
          state.abortController?.abort();
        }
        return;
      }

      if (isAwaitingAskLike(type) || isAwaitingAnswerLike(type)) {
        const chatId =
          toText(event.chatId) || toText(state.chatId) || cache.chatId;
        const planningModeAction = buildAwaitingPlanningModeAction({
          event,
          chatId,
          planningMode: state.planningMode,
        });
        if (planningModeAction) {
          dispatch(planningModeAction);
        }
        upsertLiveChatSummary({ event, cache, state });
        return;
      }

      if (
        (type === "content.start" ||
          type === "content.delta" ||
          type === "content.end" ||
          type === "content.snapshot") &&
        event.contentId
      ) {
        const contentId = String(event.contentId);
        const nodeId =
          cache.contentNodeById.get(contentId) ??
          state.contentNodeById.get(contentId) ??
          "";
        const text = nodeId ? getCachedNodeText(cache, state, nodeId) : "";
        const voiceStatus =
          type === "content.end" || type === "content.snapshot"
            ? "completed"
            : "running";
        const activeVoiceRequestId = String(
          state.voiceChat.activeRequestId || "",
        ).trim();
        const activeVoiceContentId = String(
          state.voiceChat.activeAssistantContentId || "",
        ).trim();
        const voiceEnabled = isVoiceEnabled();
        const isVoiceRequestActive =
          voiceEnabled &&
          state.inputMode === "voice" &&
          Boolean(activeVoiceRequestId) &&
          activeVoiceRequestId === state.requestId;
        const shouldAttachVoiceContent =
          isVoiceRequestActive &&
          (!activeVoiceContentId || activeVoiceContentId === contentId);
        if (shouldAttachVoiceContent && !activeVoiceContentId) {
          dispatch({
            type: "PATCH_VOICE_CHAT",
            patch: { activeAssistantContentId: contentId },
          });
        }

        if (shouldAttachVoiceContent) {
          const spokenText = stripSpecialBlocksFromText(text || "");
          dispatch({
            type: "PATCH_VOICE_CHAT",
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
                  type: "PATCH_VOICE_CHAT",
                  patch: {
                    status: "speaking",
                    error: "",
                    activeTtsTaskId:
                      result.taskId || state.voiceChat.activeTtsTaskId,
                    ttsCommitted: false,
                  },
                });
              })
              .catch((error) => {
                dispatch({
                  type: "PATCH_VOICE_CHAT",
                  patch: {
                    status: "error",
                    error: (error as Error).message,
                    sessionActive: false,
                  },
                });
              });
          }
        } else if (voiceEnabled) {
          getVoiceRuntime()?.processTtsVoiceBlocks(
            contentId,
            text,
            voiceStatus,
            "live",
          );
        }

        if (voiceStatus === "completed") {
          upsertLiveChatSummary({
            event,
            cache,
            state,
          });
        }
        return;
      }

      if (type === "reasoning.start" || type === "reasoning.delta") {
        if (cache.activeReasoningKey) {
          clearReasoningAutoCollapse(cache.activeReasoningKey);
        }
        return;
      }

      if (type === "reasoning.end" || type === "reasoning.snapshot") {
        const reasoningKey =
          toText(event.reasoningId) || previousActiveReasoningKey;
        const nodeId = reasoningKey
          ? (cache.reasoningNodeById.get(reasoningKey) ??
            state.reasoningNodeById.get(reasoningKey) ??
            "")
          : "";
        if (reasoningKey && nodeId) {
          scheduleReasoningAutoCollapse(reasoningKey, nodeId);
        }
        return;
      }

      if (
        (type === "tool.start" ||
          type === "tool.snapshot" ||
          type === "tool.args") &&
        event.toolId
      ) {
        const toolId = String(event.toolId);
        const nextToolState =
          cache.toolStateById.get(toolId) ?? state.toolStates.get(toolId);
        if (type === "tool.start" && nextToolState) {
          const toolType = String(nextToolState.toolType || "")
            .trim()
            .toLowerCase();
          if (
            nextToolState.viewportKey &&
            FRONTEND_VIEWPORT_TYPES.has(toolType)
          ) {
            dispatch({
              type: "SET_ACTIVE_FRONTEND_TOOL",
              tool: {
                key: `${nextToolState.runId || ""}#${toolId}`,
                runId: nextToolState.runId || "",
                agentKey:
                  nextToolState.agentKey || toText(event.agentKey) || "",
                ...(eventOwner ? { owner: eventOwner } : {}),
                toolId,
                viewportKey: nextToolState.viewportKey,
                toolType,
                toolLabel: nextToolState.toolLabel || "",
                toolName: nextToolState.toolName || "",
                description: nextToolState.description || "",
                toolTimeout: nextToolState.toolTimeout ?? null,
                toolParams: nextToolState.toolParams || {},
                loading: false,
                loadError: "",
                viewportHtml: "",
              },
            });
          }
        }

        if (type === "tool.args" && nextToolState?.toolParams) {
          const active = state.activeFrontendTool;
          const activeKey = `${nextToolState.runId || state.runId || ""}#${toolId}`;
          if (active && active.key === activeKey) {
            dispatch({
              type: "SET_ACTIVE_FRONTEND_TOOL",
              tool: {
                ...active,
                toolLabel: nextToolState.toolLabel || active.toolLabel || "",
                toolName: nextToolState.toolName || active.toolName || "",
                toolParams: nextToolState.toolParams,
              },
            });
          }
        }
        return;
      }

      if (type === "artifact.publish") {
        if (commands.length > 0) {
          expandArtifactForUpdate();
        }
        return;
      }

      if (isPlanViewEventType(type)) {
        if (commands.length > 0) {
          expandPlanForUpdate();
        }
        return;
      }
    },
    [
      activeQuerySessionRequestIdRef,
      clearReasoningAutoCollapse,
      dispatch,
      expandArtifactForUpdate,
      expandPlanForUpdate,
      querySessionsRef,
      scheduleReasoningAutoCollapse,
      stateRef,
      upsertLiveChatSummary,
    ],
  );

  return { handleEvent, resetCache };
}
