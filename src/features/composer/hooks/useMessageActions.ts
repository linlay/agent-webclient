import { useCallback, useEffect } from "react";
import { useAppContext } from "@/app/state/AppContext";
import type { AppAction } from "@/app/state/AppContext";
import type { TimelineAttachment } from "@/app/state/types";
import { AIRunEventTypeEnum } from "@/app/state/types";
import type { AgentEventSink } from "@/features/events/lib/eventSink";
import {
  createRequestId,
  type QueryAccessLevel,
  type QueryModelOverride,
  setAccessToken,
} from "@/shared/data";
import { parseLeadingAgentMention } from "@/features/composer/lib/mentionParser";
import { resolveMentionCandidatesFromState } from "@/features/composer/lib/mentionCandidates";
import { getVoiceRuntime } from "@/features/voice/lib/voiceRuntime";
import { resolveQueryStreamExecutor as resolveTransportQueryStreamExecutor } from "@/features/transport/lib/queryStreamExecutors";
import {
  dispatchDetachRunEvent,
  type DetachRunEventDetail,
} from "@/features/runs/lib/runControlEvents";
import { normalizeTimelineAttachments } from "@/features/artifacts/lib/timelineAttachments";
import { upsertLiveChatSummary as buildLiveChatSummary } from "@/features/chats/lib/chatSummaryLive";
import { formatPlatformErrorForDisplay } from "@/shared/data/errors/platformError";
import {
  createLiveQuerySession,
  snapshotConversationState,
  markSessionSnapshotApplied,
  type LiveQuerySession,
} from "@/features/conversation/lib/conversationSession";
import { readRunAgentKeyFromEvent } from "@/features/runs/lib/runAgentIdentity";
import { readExplicitEditingMode } from "@/features/runs/lib/editingMode";
import {
  resolvePreferredRunOwner,
  resolveRunOwner,
} from "@/features/runs/lib/runOwner";
import { toRunOwner } from "@/shared/data/runOwner";
import type { AgentEvent, AppState } from "@/app/state/types";
import {
  readEventTeamId,
  readRequestQueryText,
} from "@/shared/utils/eventFieldReaders";
import { toText } from "@/shared/utils/eventUtils";

interface SendMessageEventDetail {
  message?: unknown;
  references?: unknown;
  attachments?: unknown;
  chatId?: unknown;
  agentKey?: unknown;
  teamId?: unknown;
  params?: unknown;
  accessLevel?: unknown;
  model?: unknown;
  editingMode?: unknown;
  requiredSkillAgentKey?: unknown;
  requiredSkillKeys?: unknown;
}

function notifyNewChatCreated(input: { chatId: string; agentKey: string }): void {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function" ||
    typeof CustomEvent === "undefined"
  ) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("agent:new-chat-created", {
      detail: input,
    }),
  );
}

function isTerminalRunEventType(type: string): boolean {
  return (
    type === "run.error" || type === "run.complete" || type === "run.cancel"
  );
}

export function syncLiveSessionTerminalState(
  session: Pick<LiveQuerySession, "streaming" | "abortController">,
  event: AgentEvent,
): boolean {
  const type = toText(event.type);
  if (!isTerminalRunEventType(type)) {
    return false;
  }

  session.streaming = false;
  session.abortController = null;
  return true;
}

export function canSendToTargetChat(input: {
  currentActiveSession: Pick<
    LiveQuerySession,
    "streaming" | "abortController" | "chatId"
  > | null;
  currentChatActiveRun?: Pick<NonNullable<AppState["currentChatActiveRun"]>, "chatId" | "runId"> | null;
  currentStateChatId?: string;
  targetChatId?: string;
}): boolean {
  const currentSessionChatId = String(
    input.currentActiveSession?.chatId || input.currentStateChatId || "",
  ).trim();
  const targetChatId = String(input.targetChatId || "").trim();
  const isSameChat = !targetChatId || targetChatId === currentSessionChatId;
  const activeRunChatId = String(input.currentChatActiveRun?.chatId || "").trim();
  const activeRunId = String(input.currentChatActiveRun?.runId || "").trim();
  if (
    activeRunChatId &&
    activeRunId &&
    (targetChatId ? targetChatId === activeRunChatId : currentSessionChatId === activeRunChatId)
  ) {
    return false;
  }

  if (!input.currentActiveSession?.streaming || !isSameChat) {
    return true;
  }

  return false;
}

export function resolveDifferentChatDetachRunDetail(input: {
  currentActiveSession: Pick<
    LiveQuerySession,
    "streaming" | "chatId" | "runId" | "agentKey" | "owner"
  > | null;
  currentState: AppState;
  targetChatId?: string;
}): DetachRunEventDetail | null {
  const targetChatId = String(input.targetChatId || "").trim();
  const chatId = String(
    input.currentActiveSession?.chatId || input.currentState.chatId || "",
  ).trim();
  if (!targetChatId || !chatId || targetChatId === chatId) {
    return null;
  }
  if (!input.currentActiveSession?.streaming) {
    return null;
  }

  const runId = String(
    input.currentActiveSession?.runId || input.currentState.runId || "",
  ).trim();
  if (!runId) {
    return null;
  }
  const owner = resolveRunOwner({
    chatId,
    chats: input.currentState.chats,
    sessionOwner: input.currentActiveSession?.owner,
    fallbackOwner: toRunOwner({
      agentKey:
        input.currentActiveSession?.agentKey
        || input.currentState.runAgentById.get(runId)
        || input.currentState.currentRunAgentKey,
    }),
  });

  return {
    chatId,
    runId,
    ...(owner?.kind === "agent" ? { agentKey: owner.agentKey } : {}),
    ...(owner ? { owner } : {}),
    reason: "chat_switch",
  };
}

export const resolveQueryStreamExecutor = resolveTransportQueryStreamExecutor;

function normalizeQueryAccessLevel(
  value: unknown,
): QueryAccessLevel | undefined {
  return value === "default" ||
    value === "auto_approve" ||
    value === "full_access"
    ? value
    : undefined;
}

function normalizeQueryModelOverride(
  value: unknown,
): QueryModelOverride | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const key = String(record.key || "").trim();
  const reasoningEffort = String(record.reasoningEffort || "").trim();
  const serviceTier = String(record.serviceTier || "")
    .trim()
    .toUpperCase();
  const model: QueryModelOverride = {};
  if (key) {
    model.key = key;
  }
  if (
    reasoningEffort === "LOW" ||
    reasoningEffort === "MEDIUM" ||
    reasoningEffort === "HIGH" ||
    reasoningEffort === "NONE"
  ) {
    model.reasoningEffort = reasoningEffort;
  }
  if (serviceTier && serviceTier !== "STANDARD") {
    model.serviceTier = serviceTier;
  }
  return model.key || model.reasoningEffort || model.serviceTier
    ? model
    : undefined;
}

/**
 * useMessageActions — handles sending messages and processing the query stream.
 */
export function useMessageActions(options: { onAgentEvent: AgentEventSink }) {
  const {
    state,
    dispatch,
    stateRef,
    querySessionsRef,
    chatQuerySessionIndexRef,
    activeQuerySessionRequestIdRef,
  } = useAppContext();
  const handleEvent = options.onAgentEvent;

  /* Apply access token on mount and change */
  useEffect(() => {
    setAccessToken(state.accessToken);
  }, [state.accessToken]);

  const sendMessage = useCallback(
    async (
      inputMessage: string,
      references: unknown[] = [],
      attachments: TimelineAttachment[] = [],
      params: Record<string, unknown> = {},
      accessLevel?: QueryAccessLevel,
      model?: QueryModelOverride,
      preferredChatId = "",
      preferredAgentKey = "",
      preferredTeamId = "",
      editingMode = false,
      requiredSkillKeys: string[] = [],
      requiredSkillAgentKey = "",
    ) => {
      const rawMessage = String(inputMessage ?? "").trim();
      const normalizedReferences = Array.isArray(references)
        ? references.filter((reference) => reference != null)
        : [];
      const normalizedRequiredSkillKeys = Array.from(
        new Set(
          requiredSkillKeys
            .map((key) => String(key || "").trim())
            .filter(Boolean),
        ),
      );
      if (!rawMessage && normalizedReferences.length === 0) return;

      /* ── Parallel-query guard ── */
      const currentActiveReqId = String(
        activeQuerySessionRequestIdRef.current || "",
      ).trim();
      const currentActiveSession = currentActiveReqId
        ? (querySessionsRef.current.get(currentActiveReqId) ?? null)
        : null;
      const targetChatId = String(preferredChatId || "").trim();
      const canSend = canSendToTargetChat({
        currentActiveSession,
        currentChatActiveRun: stateRef.current.currentChatActiveRun,
        currentStateChatId: String(stateRef.current.chatId || "").trim(),
        targetChatId,
      });

      if (!canSend) {
        // Same chat is already streaming — block duplicate submit
        return;
      }

      const currentSessionChatId =
        currentActiveSession?.chatId ||
        String(stateRef.current.chatId || "").trim();
      const isSameChat = !targetChatId || targetChatId === currentSessionChatId;

      if (currentActiveSession?.streaming && !isSameChat) {
        // Different chat requested while current is streaming — detach current session
        const detachDetail = resolveDifferentChatDetachRunDetail({
          currentActiveSession,
          currentState: stateRef.current,
          targetChatId,
        });
        if (detachDetail) {
          dispatchDetachRunEvent(detachDetail);
        } else {
          dispatch({
            type: "APPEND_DEBUG",
            line: `[detach] skipped: missing runId or agentKey (chatId=${currentSessionChatId || "-"})`,
          });
        }
        if (currentActiveSession) {
          currentActiveSession.snapshot = snapshotConversationState(
            stateRef.current,
          );
          currentActiveSession.chatId =
            currentActiveSession.chatId || currentSessionChatId;
          currentActiveSession.runId =
            currentActiveSession.runId ||
            String(stateRef.current.runId || "").trim();
          currentActiveSession.streaming = true;
          currentActiveSession.abortController =
            stateRef.current.abortController;
          markSessionSnapshotApplied(currentActiveSession);
        }
        if (stateRef.current.transportMode === "sse") {
          stateRef.current.abortController?.abort();
        }
        activeQuerySessionRequestIdRef.current = "";
        dispatch({ type: "RESET_ACTIVE_CONVERSATION" });
        window.dispatchEvent(new CustomEvent("agent:reset-event-cache"));
      }

      /* Parse @mention */
      const mentionAgents = resolveMentionCandidatesFromState(stateRef.current);
      const mentionEnabled =
        Array.isArray(mentionAgents) && mentionAgents.length > 0;
      const mention = mentionEnabled
        ? parseLeadingAgentMention(rawMessage, mentionAgents)
        : {
            cleanMessage: rawMessage.trim(),
            mentionAgentKey: "",
            mentionToken: "",
            error: "",
            hasMention: false,
          };
      if (mention.error) {
        dispatch({
          type: "APPEND_DEBUG",
          line: `[mention] ${mention.error}`,
        });
        return;
      }

      const chatId = String(
        preferredChatId || stateRef.current.chatId || "",
      ).trim();
      let selectedOwner = resolvePreferredRunOwner(stateRef.current, {
        chatId,
        explicitAgentKey: preferredAgentKey,
        explicitTeamId: preferredTeamId,
      });

      if (mention.mentionAgentKey && selectedOwner?.kind !== "orchestrated-team") {
        selectedOwner = { kind: "agent", agentKey: mention.mentionAgentKey };
      }

      const selectedAgentKey = selectedOwner?.kind === "agent" ? selectedOwner.agentKey : "";
      const selectedTeamId = selectedOwner?.kind === "orchestrated-team" ? selectedOwner.teamId : "";
      const cleanMessage = selectedOwner?.kind === "orchestrated-team" && mention.mentionAgentKey
        ? rawMessage
        : mention.cleanMessage || rawMessage;

      const selectedAgent = stateRef.current.agents.find(
        (agent) => toText(agent?.key) === selectedAgentKey,
      );
      const selectedAgentMode = String(selectedAgent?.mode || "").trim();

      if (!cleanMessage.trim() && normalizedReferences.length === 0) return;
      if (!selectedOwner) {
        dispatch({
          type: "APPEND_DEBUG",
          line: "[send] skipped: missing run owner",
        });
        return;
      }
      if (
        normalizedRequiredSkillKeys.length > 0 &&
        requiredSkillAgentKey &&
        selectedAgentKey !== requiredSkillAgentKey
      ) {
        dispatch({
          type: "APPEND_DEBUG",
          line: `[send] skipped: required skill agent mismatch (expected=${requiredSkillAgentKey || "-"}, resolved=${selectedAgentKey || "-"})`,
        });
        return;
      }

      if (
        selectedAgentKey &&
        selectedAgentKey ===
          String(stateRef.current.temporaryPinnedAgentKey || "").trim()
      ) {
        dispatch({ type: "SET_TEMPORARY_PINNED_AGENT_KEY", agentKey: "" });
      }

      dispatch({
        type: "SET_WORKER_PRIORITY_KEY",
        workerKey: selectedAgentKey ? `agent:${selectedAgentKey}` : "",
      });

      if (mention.mentionAgentKey && selectedOwner?.kind === "agent") {
        if (chatId) {
          dispatch({
            type: "SET_CHAT_AGENT_BY_ID",
            chatId,
            agentKey: mention.mentionAgentKey,
          });
        } else {
          dispatch({
            type: "SET_PENDING_NEW_CHAT_AGENT_KEY",
            agentKey: mention.mentionAgentKey,
          });
        }
      }

      /* Add user message to timeline (mention prefix is routing metadata, not message body) */
      const userNodeId = `user_${Date.now()}`;
      dispatch({
        type: "SET_TIMELINE_NODE",
        id: userNodeId,
        node: {
          id: userNodeId,
          kind: "message",
          role: "user",
          text: cleanMessage,
          attachments: attachments.length > 0 ? attachments : undefined,
          ts: Date.now(),
        },
      });
      dispatch({ type: "APPEND_TIMELINE_ORDER", id: userNodeId });

      getVoiceRuntime()?.resetVoiceRuntime();

      /* Start streaming */
      const requestId = createRequestId("req");
      const abortController = new AbortController();
      if (chatId && selectedOwner?.kind === "agent") {
        dispatch({
          type: "SET_CHAT_AGENT_BY_ID",
          chatId,
          agentKey: selectedAgentKey,
        });
      }
      const session = createLiveQuerySession({
        requestId,
        observationSource: "query",
        chatId,
        agentKey: selectedAgentKey,
        teamId: selectedTeamId,
        owner: selectedOwner || undefined,
        editingMode: editingMode === true,
      });
      querySessionsRef.current.set(requestId, session);
      if (chatId) {
        chatQuerySessionIndexRef.current.set(chatId, requestId);
      }
      activeQuerySessionRequestIdRef.current = requestId;
      let newChatRouteNotified = false;

      const isSessionActive = () =>
        activeQuerySessionRequestIdRef.current === session.requestId;
      const bindSessionIdentity = (event: AgentEvent) => {
        const nextChatId = toText(event.chatId);
        if (nextChatId) {
          session.chatId = nextChatId;
          chatQuerySessionIndexRef.current.set(nextChatId, session.requestId);
          if (session.snapshot && !session.snapshot.chatId) {
            session.snapshot.chatId = nextChatId;
          }
          if (!chatId && !newChatRouteNotified) {
            newChatRouteNotified = true;
            if (session.owner?.kind === "agent") {
              notifyNewChatCreated({
                chatId: nextChatId,
                agentKey: session.owner.agentKey,
              });
            }
          }
        }
        const nextRunId = toText(event.runId);
        if (nextRunId) {
          session.runId = nextRunId;
          if (session.snapshot && !session.snapshot.runId) {
            session.snapshot.runId = nextRunId;
          }
        }
        const nextAgentKey = toText(event.agentKey);
        if (nextAgentKey && session.owner?.kind !== "orchestrated-team") {
          session.agentKey = nextAgentKey;
        }
        const binding = readRunAgentKeyFromEvent(event);
        if (binding && session.owner?.kind !== "orchestrated-team") {
          dispatch({
            type: "SET_RUN_AGENT_BY_ID",
            runId: binding.runId,
            agentKey: binding.agentKey,
          });
          if (
            !stateRef.current.runId ||
            stateRef.current.runId === binding.runId
          ) {
            dispatch({
              type: "SET_CURRENT_RUN_AGENT_KEY",
              agentKey: binding.agentKey,
            });
          }
        }
        const nextTeamId = readEventTeamId(event);
        if (nextTeamId) {
          session.teamId = nextTeamId;
          if (!session.owner) {
            session.owner = { kind: "orchestrated-team", teamId: nextTeamId };
          }
        }
        if (toText(event.type) === "request.query") {
          const eventEditingMode = readExplicitEditingMode(event);
          if (
            session.observationSource === "attach" &&
            eventEditingMode !== undefined
          ) {
            session.editingMode = eventEditingMode;
          }
        }
      };
      const upsertBackgroundChatSummary = (
        event: AgentEvent,
        lastRunContent?: string,
      ) => {
        const next = buildLiveChatSummary({
          event,
          cache: {
            chatId: session.chatId,
            runId: session.runId,
            agentKey: session.agentKey,
            teamId: session.teamId,
            editingMode: session.editingMode,
          },
          state: stateRef.current,
          selectedContext: {
            agentKey: "",
            teamId: "",
          },
          lastRunContent,
        });
        if (!next) {
          return;
        }

        session.chatId = next.resolved.chatId;
        session.runId = next.resolved.runId;
        session.agentKey = session.owner?.kind === "orchestrated-team" ? "" : next.resolved.agentKey;
        session.teamId = next.resolved.teamId;
        session.editingMode = next.resolved.editingMode;
        chatQuerySessionIndexRef.current.set(
          next.resolved.chatId,
          session.requestId,
        );
        if (session.snapshot && !session.snapshot.chatId) {
          session.snapshot.chatId = next.resolved.chatId;
        }
        dispatch({ type: "UPSERT_CHAT", chat: next.chat });
        if (next.resolved.chatId && next.resolved.agentKey && session.owner?.kind !== "orchestrated-team") {
          dispatch({
            type: "SET_CHAT_AGENT_BY_ID",
            chatId: next.resolved.chatId,
            agentKey: next.resolved.agentKey,
          });
        }
      };
      const sessionDispatch = (action: AppAction) => {
        switch (action.type) {
          case "SET_REQUEST_ID":
            session.requestId = action.requestId;
            if (isSessionActive()) {
              dispatch(action);
            }
            return;
          case "SET_STREAMING":
            session.streaming = action.streaming;
            if (isSessionActive()) {
              dispatch(action);
            }
            return;
          case "SET_ABORT_CONTROLLER":
            session.abortController = action.controller;
            if (isSessionActive()) {
              dispatch(action);
            }
            return;
          case "APPEND_DEBUG":
            session.bufferedDebugLines.push(action.line);
            if (isSessionActive()) {
              dispatch(action);
            }
            return;
          default:
            if (isSessionActive()) {
              dispatch(action);
            }
        }
      };
      const sessionHandleEvent = (event: AgentEvent) => {
        session.bufferedEvents.push(event);
        bindSessionIdentity(event);
        syncLiveSessionTerminalState(session, event);

        if (isSessionActive()) {
          handleEvent(event);
          return;
        }

        const type = toText(event.type);
        if (type === "request.query") {
          upsertBackgroundChatSummary(
            event,
            event?.taskId
              ? undefined
              : readRequestQueryText(event) || undefined,
          );
          return;
        }
        if (type === "run.start" || isTerminalRunEventType(type)) {
          upsertBackgroundChatSummary(event);
          return;
        }
        if (
          (type === "content.end" || type === "content.snapshot") &&
          event.contentId
        ) {
          upsertBackgroundChatSummary(event);
        }
      };

      try {
        await resolveQueryStreamExecutor(stateRef.current.transportMode)({
          params: {
            requestId,
            message: cleanMessage,
            owner: selectedOwner,
            chatId: chatId || undefined,
            references:
              normalizedReferences.length > 0
                ? normalizedReferences
                : undefined,
            accessLevel,
            model,
            params: Object.keys(params).length > 0 ? params : undefined,
            planningMode: Boolean(stateRef.current.planningMode),
            editingMode: session.editingMode === true,
            requiredSkillKeys:
              normalizedRequiredSkillKeys.length > 0
                ? normalizedRequiredSkillKeys
                : undefined,
            agentMode: selectedAgentMode || undefined,
            signal: abortController.signal,
          },
          dispatch: sessionDispatch,
          handleEvent: sessionHandleEvent,
        });
      } catch (error) {
        const err = error as Error;
        if (err.name !== "AbortError") {
          const display = formatPlatformErrorForDisplay(err);
          if (display.code === "editing_mode_unsupported") {
            session.editingMode = false;
            if (isSessionActive()) {
              dispatch({ type: "SET_EDITING_MODE", enabled: false });
            }
          }
          if (isSessionActive()) {
            dispatch({
              type: "APPEND_DEBUG",
              line: `[send error] ${err.message}`,
            });
            const errNodeId = `sys_${Date.now()}`;
            dispatch({
              type: "SET_TIMELINE_NODE",
              id: errNodeId,
              node: {
                id: errNodeId,
                kind: "message",
                role: "system",
                text: display.message,
                errorDetail: display.error,
                ts: Date.now(),
              },
            });
            dispatch({ type: "APPEND_TIMELINE_ORDER", id: errNodeId });
          } else {
            const syntheticErrorEvent: AgentEvent = {
              type: AIRunEventTypeEnum.Error,
              chatId: session.chatId || undefined,
              runId: session.runId || undefined,
              requestId: session.requestId,
              error: display.error,
              timestamp: Date.now(),
            };
            session.bufferedDebugLines.push(`[send error] ${err.message}`);
            session.bufferedEvents.push(syntheticErrorEvent);
            upsertBackgroundChatSummary(syntheticErrorEvent);
          }
        }
      }
    },
    [
      activeQuerySessionRequestIdRef,
      chatQuerySessionIndexRef,
      dispatch,
      handleEvent,
      querySessionsRef,
      stateRef,
    ],
  );

  const abortStream = useCallback(() => {
    stateRef.current.abortController?.abort();
    getVoiceRuntime()?.stopAllVoiceSessions("user_stop", { mode: "stop" });
    dispatch({ type: "SET_STREAMING", streaming: false });
    dispatch({ type: "SET_ABORT_CONTROLLER", controller: null });
  }, [dispatch, stateRef]);

  /* Listen for custom send-message events from ComposerArea */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = ((e as CustomEvent).detail ||
        {}) as SendMessageEventDetail;
      const message = String(detail.message || "").trim();
      const references = Array.isArray(detail.references)
        ? detail.references
        : [];
      const attachments = normalizeTimelineAttachments(detail.attachments);
      const params =
        detail.params &&
        typeof detail.params === "object" &&
        !Array.isArray(detail.params)
          ? (detail.params as Record<string, unknown>)
          : {};
      const accessLevel = normalizeQueryAccessLevel(detail.accessLevel);
      const model = normalizeQueryModelOverride(detail.model);
      const chatId = String(detail.chatId || "").trim();
      const agentKey = String(detail.agentKey || "").trim();
      const teamId = String(detail.teamId || "").trim();
      const editingMode = detail.editingMode === true;
      const requiredSkillAgentKey = String(
        detail.requiredSkillAgentKey || "",
      ).trim();
      const requiredSkillKeys = Array.isArray(detail.requiredSkillKeys)
        ? detail.requiredSkillKeys
            .map((key) => String(key || "").trim())
            .filter(Boolean)
        : [];
      if (message) {
        void sendMessage(
          message,
          references,
          attachments,
          params,
          accessLevel,
          model,
          chatId,
          agentKey,
          teamId,
          editingMode,
          requiredSkillKeys,
          requiredSkillAgentKey,
        );
      }
    };
    window.addEventListener("agent:send-message", handler);
    return () => window.removeEventListener("agent:send-message", handler);
  }, [sendMessage]);

  return { sendMessage, abortStream };
}
