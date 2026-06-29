import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import { App as AntdApp } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import type { AppAction } from "@/app/state/AppContext";
import type {
	AppState,
	AIContextCompactEvent,
	AIUsageSnapshotEvent,
} from "@/app/state/types";
import { AIContextEventTypeEnum, AIUsageEventTypeEnum } from "@/app/state/types";
import {
  createRequestId,
  type CompactChatResponse,
  type QueryAccessLevel,
  type QueryModelOverride,
} from "@/shared/data";
import {
  compactChat,
  interruptChat,
  learnChat,
  rememberChat,
  steerChat,
} from "@/shared/data";
import {
  resolvePreferredAgentKey,
  resolvePreferredTeamId,
} from "@/features/composer/lib/queryRouting";
import { resolveRunAgentKey } from "@/features/chats/lib/runAgentIdentity";
import { useSlashCommandExecution } from "@/features/composer/hooks/useSlashCommandExecution";
import type {
  SlashCommandAvailability,
  SlashCommandId,
} from "@/features/composer/lib/slashCommands";
import {
  normalizeSteerSubmissionResponse,
  resolveActiveRunId,
} from "@/features/composer/lib/steerSubmission";
import { useI18n } from "@/shared/i18n";

type ComposerSendAttachmentMeta = {
  name: string;
  size: number;
  type?: string;
  mimeType?: string;
  url?: string;
};

interface UseComposerSendInput {
  attachmentChatId: string;
  accessLevel: QueryAccessLevel;
  clearComposerAttachments: () => void;
  closeMention: () => void;
  controlParams: Record<string, unknown>;
  dispatch: Dispatch<AppAction>;
  executeSlashCommandInput: {
    closeMention: () => void;
    latestQueryText: string;
    setInputValue: (value: string) => void;
    setSlashDismissed: (dismissed: boolean) => void;
    slashAvailability: SlashCommandAvailability;
    state: Pick<AppState, "rightSidebarOpen" | "planningMode" | "chatId" | "usagePopoverOpen">;
    toggleVoiceMode: () => void;
  };
  backgroundCommandText: {
    rememberPending: string;
    rememberError: string;
    learnPending: string;
    learnError: string;
    compactPending: string;
    compactError: string;
  };
  hasUploadingAttachments: boolean;
  inputValue: string;
  isAwaitingActive: boolean;
  isVoiceMode: boolean;
  modelOverride: QueryModelOverride;
  selectSlashCommand: () => { id: SlashCommandId } | null;
  showSlashPalette: boolean;
  sendAttachmentMeta: ComposerSendAttachmentMeta[];
  sendReferences: unknown[];
  setInputValue: Dispatch<SetStateAction<string>>;
  setSlashDismissed: Dispatch<SetStateAction<boolean>>;
  speechListening: boolean;
  state: Pick<
    AppState,
    | "abortController"
    | "chatAgentById"
    | "chatId"
    | "chats"
    | "currentRunAgentKey"
    | "rightSidebarOpen"
    | "events"
    | "pendingNewChatAgentKey"
    | "planningMode"
    | "runAgentById"
    | "runId"
    | "streaming"
    | "usageSnapshot"
    | "workerIndexByKey"
    | "workerSelectionKey"
  > & {
    pendingSteers: AppState["pendingSteers"];
  };
  stateRef: MutableRefObject<AppState>;
  stopSpeechInput: () => void;
  textareaRef: RefObject<TextAreaRef>;
  updateMentionSuggestions: (value: string) => void;
}

function compactTimelineText(
  data: CompactChatResponse,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (!data.accepted || data.status === "skipped") {
    return data.detail || t("contextCompact.noHistory");
  }
  const source =
    data.summarySource === "deterministic_fallback"
      ? t("contextCompact.source.deterministicFallback")
      : t("contextCompact.source.model");
  const parts = [
    t("contextCompact.completed"),
    t("contextCompact.summarySource", { source }),
  ];
  if (typeof data.originalMessages === "number" && data.originalMessages > 0) {
    parts.push(
      t("contextCompact.originalMessages", { count: data.originalMessages }),
    );
  }
  if (typeof data.toolDigestCount === "number" && data.toolDigestCount > 0) {
    parts.push(
      t("contextCompact.toolDigestCount", { count: data.toolDigestCount }),
    );
  }
  if (typeof data.compressionRatio === "number" && data.compressionRatio > 0) {
    parts.push(
      t("contextCompact.compressionRatio", {
        ratio: Math.round(data.compressionRatio * 100),
      }),
    );
  }
  return parts.join(" · ");
}

function readCompactNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function latestUsageSnapshotFromEvents(events: readonly unknown[]): AIUsageSnapshotEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!isObjectRecord(event) || event.type !== AIUsageEventTypeEnum.Snapshot) {
      continue;
    }
    const snapshot = event as unknown as AIUsageSnapshotEvent;
    if (snapshot.contextWindow || snapshot.usage) {
      return snapshot;
    }
  }
  return null;
}

export function buildCompactUsageSnapshot(
  data: CompactChatResponse,
  previous: AIUsageSnapshotEvent | null,
): AIUsageSnapshotEvent | null {
  if (!data.accepted || data.status === "skipped") {
    return null;
  }
  const currentSize = readCompactNumber(data.postCompactEstimatedTokens);
  if (currentSize == null) {
    return null;
  }
  const previousContext = previous?.contextWindow || {};
  return {
    type: AIUsageEventTypeEnum.Snapshot,
    chatId: data.chatId || previous?.chatId || "",
    runId: previous?.runId || data.boundaryRunId || "",
    ...(previous?.model ? { model: previous.model } : {}),
    contextWindow: {
      ...previousContext,
      currentSize,
      estimatedNextCallSize: currentSize,
    },
    ...(previous?.usage ? { usage: previous.usage } : {}),
  };
}

function buildCompactCompleteEvent(
  data: CompactChatResponse,
  requestId: string,
  chatId: string,
): AIContextCompactEvent | null {
  if (!data.accepted || data.status === "skipped") {
    return null;
  }
  return {
    type: AIContextEventTypeEnum.CompactComplete,
    requestId: data.requestId || requestId,
    chatId: data.chatId || chatId,
    runId: data.boundaryRunId,
    compactId: data.compactId,
    summarySource: data.summarySource,
    generation: data.generation,
    toolDigestCount: data.toolDigestCount,
    compactedRunCount: data.compactedRunCount,
    digestedRunIds: data.digestedRunIds,
    originalMessages: data.originalMessages,
    projectedMessages: data.projectedMessages,
    preCompactEstimatedTokens: data.preCompactEstimatedTokens,
    postCompactEstimatedTokens: data.postCompactEstimatedTokens,
    compressionRatio: data.compressionRatio,
    elapsedMs: data.elapsedMs,
    compactionUsage: data.compactionUsage as AIContextCompactEvent["compactionUsage"],
    cacheMetrics: data.cacheMetrics,
  };
}

export function useComposerSend(input: UseComposerSendInput) {
  const {
    attachmentChatId,
    accessLevel,
    clearComposerAttachments,
    closeMention,
    controlParams,
    dispatch,
    executeSlashCommandInput,
    backgroundCommandText,
    hasUploadingAttachments,
    inputValue,
    isAwaitingActive,
    isVoiceMode,
    modelOverride,
    selectSlashCommand,
    showSlashPalette,
    sendAttachmentMeta,
    sendReferences,
    setInputValue,
    setSlashDismissed,
    speechListening,
    state,
    stateRef,
    stopSpeechInput,
    textareaRef,
    updateMentionSuggestions,
  } = input;
  const { t } = useI18n();
  const { message: messageApi } = AntdApp.useApp();
  const [steerSubmitting, setSteerSubmitting] = useState(false);
  const pendingSendRef = useRef(false);
  const pendingSentMessageRef = useRef("");

  useEffect(() => {
    const message = inputValue.trim();
    if (!message) {
      pendingSendRef.current = false;
      pendingSentMessageRef.current = "";
      return;
    }
    if (message !== pendingSentMessageRef.current) {
      pendingSendRef.current = false;
    }
  }, [inputValue]);

  const prevStreamingRef = useRef(state.streaming);
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = state.streaming;
    const steers = state.pendingSteers[String(state.chatId || "")] || [];
    if (!wasStreaming || state.streaming || steers.length === 0) {
      return;
    }
    const firstQueued = steers.find((s) => s.status === "queued");
    if (!firstQueued) return;
    dispatch({ type: "REMOVE_PENDING_STEER", steerId: firstQueued.steerId });
    window.dispatchEvent(
      new CustomEvent("agent:send-message", {
        detail: { message: firstQueued.message },
      }),
    );
  }, [state.streaming, state.pendingSteers, state.chatId, dispatch]);

  const resolveCurrentRunId = useCallback(() => {
    const currentState = stateRef.current || state;
    return resolveActiveRunId({
      stateRunId: currentState.runId,
      events: currentState.events,
    });
  }, [state, stateRef]);

  const resolveCurrentAgentKey = useCallback(() => {
    const currentState = stateRef.current || state;
    const runId = resolveCurrentRunId();
    const routingAgentKey = resolvePreferredAgentKey({
      chatId: currentState.chatId,
      chatAgentById: currentState.chatAgentById,
      chats: currentState.chats,
      pendingNewChatAgentKey: currentState.pendingNewChatAgentKey,
      workerSelectionKey: currentState.workerSelectionKey,
      workerIndexByKey: currentState.workerIndexByKey,
    });
    return resolveRunAgentKey({
      runId,
      currentRunAgentKey: currentState.currentRunAgentKey,
      runAgentById: currentState.runAgentById,
      routingAgentKey,
      chatId: currentState.chatId,
      chatAgentById: currentState.chatAgentById,
      chats: currentState.chats,
    });
  }, [resolveCurrentRunId, state, stateRef]);

  const resolveCurrentTeamId = useCallback(() => {
    const currentState = stateRef.current || state;
    return resolvePreferredTeamId({
      chatId: currentState.chatId,
      chatAgentById: currentState.chatAgentById,
      chats: currentState.chats,
      pendingNewChatAgentKey: currentState.pendingNewChatAgentKey,
      workerSelectionKey: currentState.workerSelectionKey,
      workerIndexByKey: currentState.workerIndexByKey,
    });
  }, [state, stateRef]);

  const resetForNewConversation = useCallback(() => {
    clearComposerAttachments();
    const currentState = stateRef.current || state;
    const agentKey = resolveCurrentAgentKey();
    window.dispatchEvent(
      new CustomEvent("agent:start-new-conversation", {
        detail: {
          ...(agentKey ? { agentKey } : {}),
          preserveWorkerContext:
            currentState.conversationMode === "worker" || Boolean(agentKey),
          focusComposerOnComplete: true,
        },
      }),
    );
  }, [clearComposerAttachments, resolveCurrentAgentKey, state, stateRef]);

  const interruptCurrentRun = useCallback(async () => {
    const chatId = String(state.chatId || "").trim();
    const runId = resolveCurrentRunId();
    const requestId = createRequestId("req");
    const agentKey = resolveCurrentAgentKey();
    const teamId = resolveCurrentTeamId();
    if (!chatId || !runId || !agentKey) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[interrupt] skipped: missing chatId/runId/agentKey (chatId=${chatId || "-"}, runId=${runId || "-"}, agentKey=${agentKey || "-"})`,
      });
      return;
    }

    try {
      await interruptChat({
        requestId,
        chatId,
        runId,
        agentKey: agentKey || undefined,
        teamId: teamId || undefined,
        message: "",
        planningMode: Boolean(state.planningMode),
      });
      dispatch({
        type: "APPEND_DEBUG",
        line: `[interrupt] requested for chatId=${chatId}, runId=${runId}, requestId=${requestId}`,
      });
    } catch (error) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[interrupt] failed: ${(error as Error).message}`,
      });
    } finally {
      state.abortController?.abort();
      window.dispatchEvent(
        new CustomEvent("agent:voice-stop-all", {
          detail: { reason: "interrupt", mode: "stop" },
        }),
      );
      dispatch({ type: "SET_STREAMING", streaming: false });
      dispatch({ type: "SET_ABORT_CONTROLLER", controller: null });
    }
  }, [
    dispatch,
    resolveCurrentAgentKey,
    resolveCurrentRunId,
    resolveCurrentTeamId,
    state.abortController,
    state.chatId,
    state.planningMode,
  ]);

  const scheduleCommandStatusOverlayHide = useCallback(() => {
    const timer = window.setTimeout(() => {
      dispatch({ type: "HIDE_COMMAND_STATUS_OVERLAY" });
    }, 2000);
    dispatch({
      type: "SET_COMMAND_STATUS_OVERLAY_TIMER",
      timer,
    });
  }, [dispatch]);

  const triggerCommandStatusOverlay = useCallback(
    (
      commandType: "remember" | "learn" | "compact",
      phase: "pending" | "success" | "error",
      text: string,
    ) => {
      dispatch({
        type: "SHOW_COMMAND_STATUS_OVERLAY",
        commandType,
        phase,
        text,
      });
    },
    [dispatch],
  );

  const submitBackgroundCommand = useCallback(
    async (
      commandType: "remember" | "learn" | "compact",
      texts: { pending: string; error: string },
    ) => {
      const chatId = String(state.chatId || "").trim();
      if (!chatId) {
        return;
      }

      const requestId = createRequestId(commandType);
      triggerCommandStatusOverlay(commandType, "pending", texts.pending);

      try {
        const request =
          commandType === "remember"
            ? rememberChat
            : commandType === "learn"
              ? learnChat
              : compactChat;
        const response = await request({
          requestId,
          chatId,
        });
        if (commandType === "compact" && response.data) {
          const compactData = response.data as CompactChatResponse;
          const compactEvent = buildCompactCompleteEvent(compactData, requestId, chatId);
          if (compactEvent) {
            dispatch({ type: "PUSH_EVENT", event: compactEvent });
          }
          const usageSnapshot = buildCompactUsageSnapshot(
            compactData,
            state.usageSnapshot || latestUsageSnapshotFromEvents(state.events),
          );
          if (usageSnapshot) {
            dispatch({ type: "SET_USAGE_SNAPSHOT", snapshot: usageSnapshot });
          }
          const nodeId = `compact_${compactData.compactId || requestId}`;
          const text = compactTimelineText(compactData, t);
          dispatch({
            type: "SET_TIMELINE_NODE",
            id: nodeId,
            node: {
              id: nodeId,
              kind: "message",
              role: "system",
              messageVariant: "compact",
              text,
              ts: Date.now(),
            },
          });
          dispatch({ type: "APPEND_TIMELINE_ORDER", id: nodeId });
        }
        dispatch({
          type: "APPEND_DEBUG",
          line: `[${commandType}] submitted for chatId=${chatId}, requestId=${requestId}`,
        });
        triggerCommandStatusOverlay(commandType, "success", texts.pending);
      } catch (error) {
        dispatch({
          type: "APPEND_DEBUG",
          line: `[${commandType}] failed: ${(error as Error).message}`,
        });
        triggerCommandStatusOverlay(commandType, "error", texts.error);
      } finally {
        scheduleCommandStatusOverlayHide();
      }
    },
    [
      dispatch,
      scheduleCommandStatusOverlayHide,
      state.chatId,
      triggerCommandStatusOverlay,
    ],
  );

  const executeSlashCommand = useSlashCommandExecution({
    slashAvailability: executeSlashCommandInput.slashAvailability,
    closeMention,
    latestQueryText: executeSlashCommandInput.latestQueryText,
    resetForNewConversation,
    dispatch,
    toggleVoiceMode: executeSlashCommandInput.toggleVoiceMode,
    submitRememberCommand: () =>
      submitBackgroundCommand("remember", {
        pending: backgroundCommandText.rememberPending,
        error: backgroundCommandText.rememberError,
      }),
    submitLearnCommand: () =>
      submitBackgroundCommand("learn", {
        pending: backgroundCommandText.learnPending,
        error: backgroundCommandText.learnError,
      }),
    submitCompactCommand: () =>
      submitBackgroundCommand("compact", {
        pending: backgroundCommandText.compactPending,
        error: backgroundCommandText.compactError,
      }),
    setInputValue,
    setSlashDismissed,
    state: executeSlashCommandInput.state,
  });

  const handleSend = useCallback(() => {
    if (isAwaitingActive || isVoiceMode) return;
    if (speechListening) {
      stopSpeechInput();
    }

    const selectedSlashCommand = showSlashPalette ? selectSlashCommand() : null;
    if (selectedSlashCommand) {
      void executeSlashCommand(selectedSlashCommand.id);
      return;
    }

    const message = inputValue.trim();
    if (!message) return;
    if (hasUploadingAttachments) return;
    if (pendingSendRef.current && pendingSentMessageRef.current === message) {
      return;
    }
    const currentState = stateRef.current || state;
    if (currentState.streaming) {
      const activeRunId = resolveCurrentRunId();
      const activeChatId = String(currentState.chatId || "").trim();
      if (!activeChatId || !activeRunId) {
        dispatch({
          type: "APPEND_DEBUG",
          line: `[send] recovered stale streaming state before submit (chatId=${activeChatId || "-"}, runId=${activeRunId || "-"})`,
        });
        dispatch({ type: "SET_STREAMING", streaming: false });
        dispatch({ type: "SET_ABORT_CONTROLLER", controller: null });
      } else {
        if (sendReferences.length > 0) {
          dispatch({
            type: "APPEND_DEBUG",
            line: "[upload] attachments are not supported while steering an active run",
          });
          return;
        }
        const steerId =
          typeof globalThis.crypto?.randomUUID === "function"
            ? globalThis.crypto.randomUUID()
            : createRequestId("steer");
        dispatch({
          type: "ENQUEUE_PENDING_STEER",
          steer: {
            steerId,
            message,
            requestId: createRequestId("req"),
            runId: activeRunId,
            createdAt: Date.now(),
            status: "queued",
          },
        });
        setInputValue("");
        setSlashDismissed(false);
        closeMention();
        return;
      }
    }
    pendingSendRef.current = true;
    pendingSentMessageRef.current = message;
    const pendingChatId = String(currentState.chatId || attachmentChatId || "").trim();
    const agentKey = resolvePreferredAgentKey({
      chatId: pendingChatId,
      chatAgentById: currentState.chatAgentById,
      chats: currentState.chats,
      pendingNewChatAgentKey: currentState.pendingNewChatAgentKey,
      workerSelectionKey: currentState.workerSelectionKey,
      workerIndexByKey: currentState.workerIndexByKey,
    });
    const teamId = resolvePreferredTeamId({
      chatId: pendingChatId,
      chatAgentById: currentState.chatAgentById,
      chats: currentState.chats,
      pendingNewChatAgentKey: currentState.pendingNewChatAgentKey,
      workerSelectionKey: currentState.workerSelectionKey,
      workerIndexByKey: currentState.workerIndexByKey,
    });
    if (pendingChatId && !String(currentState.chatId || "").trim() && !agentKey) {
      pendingSendRef.current = false;
      pendingSentMessageRef.current = "";
      dispatch({
        type: "APPEND_DEBUG",
        line: `[send] skipped: missing agentKey for pending uploaded chat (chatId=${pendingChatId})`,
      });
      return;
    }

    setInputValue("");
    clearComposerAttachments();
    setSlashDismissed(false);
    closeMention();
    window.dispatchEvent(
      new CustomEvent("agent:send-message", {
        detail: {
          message,
          chatId: pendingChatId || undefined,
          agentKey: agentKey || undefined,
          teamId: teamId || undefined,
          references: sendReferences,
          attachments: sendAttachmentMeta,
          accessLevel,
          model: modelOverride,
          params: controlParams,
        },
      }),
    );
  }, [
    attachmentChatId,
    accessLevel,
    clearComposerAttachments,
    closeMention,
    controlParams,
    dispatch,
    executeSlashCommand,
    hasUploadingAttachments,
    inputValue,
    isAwaitingActive,
    isVoiceMode,
    modelOverride,
    resolveCurrentRunId,
    selectSlashCommand,
    sendAttachmentMeta,
    sendReferences,
    setInputValue,
    setSlashDismissed,
    showSlashPalette,
    speechListening,
    state.chatAgentById,
    state.chatId,
    state.chats,
    state.pendingNewChatAgentKey,
    state.streaming,
    state.workerIndexByKey,
    state.workerSelectionKey,
    stateRef,
    stopSpeechInput,
  ]);

  const restoreMessageToComposer = useCallback(
    (message: string) => {
      setInputValue(message);
      setSlashDismissed(false);
      updateMentionSuggestions(message);
      window.requestAnimationFrame(() => {
        const el = textareaRef.current?.resizableTextArea?.textArea;
        if (!el) return;
        el.focus();
        const caret = message.length;
        el.setSelectionRange(caret, caret);
      });
    },
    [
      setInputValue,
      setSlashDismissed,
      textareaRef,
      updateMentionSuggestions,
    ],
  );

  const handleSteer = useCallback(async (steerId: string) => {
    const steer = (state.pendingSteers[String(state.chatId || "")] || []).find(
      (s) => s.steerId === steerId && s.status === "queued",
    );
    if (!steer || steerSubmitting) return;

    const chatId = String(state.chatId || "").trim();
    const agentKey = resolveCurrentAgentKey();
    const teamId = resolveCurrentTeamId();
    if (!chatId || !steer.runId || !agentKey) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[steer] skipped: missing chatId/runId/agentKey (chatId=${chatId || "-"}, runId=${steer.runId || "-"}, agentKey=${agentKey || "-"})`,
      });
      dispatch({ type: "REMOVE_PENDING_STEER", steerId });
      restoreMessageToComposer(steer.message);
      void messageApi.warning(t("composer.steer.unavailable"));
      return;
    }

    setSteerSubmitting(true);
    dispatch({ type: "UPDATE_PENDING_STEER_STATUS", steerId, status: "sending" });

    try {
      const response = await steerChat({
        requestId: steer.requestId,
        chatId,
        runId: steer.runId,
        steerId: steer.steerId,
        agentKey: agentKey || undefined,
        teamId: teamId || undefined,
        message: steer.message,
        planningMode: Boolean(state.planningMode),
      });
      const result = normalizeSteerSubmissionResponse(response);
      if (!result.accepted) {
        dispatch({ type: "REMOVE_PENDING_STEER", steerId });
        dispatch({
          type: "APPEND_DEBUG",
          line: `[steer] rejected: status=${result.status || "-"}, detail=${result.detail || "-"}`,
        });
        restoreMessageToComposer(steer.message);
        void messageApi.warning(
          t("composer.steer.rejected", {
            detail: result.detail || result.status || "unmatched",
          }),
        );
        return;
      }

      dispatch({
        type: "APPEND_DEBUG",
        line: `[steer] submitted for chatId=${chatId}, runId=${steer.runId}, requestId=${steer.requestId}`,
      });
    } catch (error) {
      dispatch({ type: "REMOVE_PENDING_STEER", steerId });
      dispatch({
        type: "APPEND_DEBUG",
        line: `[steer] failed: ${(error as Error).message}`,
      });
      restoreMessageToComposer(steer.message);
      void messageApi.error(
        t("composer.steer.failed", {
          detail: (error as Error).message,
        }),
      );
    } finally {
      setSteerSubmitting(false);
    }
  }, [
    dispatch,
    resolveCurrentAgentKey,
    resolveCurrentTeamId,
    restoreMessageToComposer,
    messageApi,
    state.chatId,
    state.planningMode,
    state.pendingSteers,
    steerSubmitting,
    t,
  ]);

  const handleCancelSteer = useCallback((steerId: string) => {
    const steer = (state.pendingSteers[String(state.chatId || "")] || []).find((s) => s.steerId === steerId);
    if (!steer) return;
    dispatch({ type: "REMOVE_PENDING_STEER", steerId });
    restoreMessageToComposer(steer.message);
  }, [
    dispatch,
    restoreMessageToComposer,
    state.pendingSteers,
    state.chatId,
  ]);

  const applyComposerDraft = useCallback(
    (draft: string) => {
      setInputValue(draft);
      setSlashDismissed(false);
      if (draft.startsWith("/")) {
        closeMention();
      } else {
        updateMentionSuggestions(draft);
      }
      window.requestAnimationFrame(() => {
        const el = textareaRef.current?.resizableTextArea?.textArea;
        if (!el) return;
        el.focus();
        const caret = draft.length;
        el.setSelectionRange(caret, caret);
      });
    },
    [closeMention, setInputValue, setSlashDismissed, textareaRef, updateMentionSuggestions],
  );

  return {
    applyComposerDraft,
    executeSlashCommand,
    handleCancelSteer,
    handleSend,
    handleSteer,
    interruptCurrentRun,
    pendingSentMessageRef,
    pendingSendRef,
    resetForNewConversation,
    setSteerSubmitting,
    steerSubmitting,
  };
}
