import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import { App as AntdApp } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import type { AppAction } from "@/app/state/AppContext";
import type { AppState } from "@/app/state/types";
import {
  createRequestId,
  type QueryAccessLevel,
  type QueryModelOverride,
} from "@/shared/data";
import {
  interruptChat,
  steerChat,
} from "@/shared/data";
import {
  resolvePreferredRunOwner,
  resolveRunOwner,
} from "@/features/runs/lib/runOwner";
import { useSlashCommandExecution } from "@/features/composer/hooks/useSlashCommandExecution";
import type {
  SlashCommandAvailability,
  SlashCommandId,
} from "@/features/composer/lib/slashCommands";
import { parseBTWSlashInput } from "@/features/composer/lib/slashCommands";
import { useBTW } from "@/features/btw/components/BtwProvider";
import {
  normalizeSteerSubmissionResponse,
  resolveActiveRunId,
} from "@/features/composer/lib/steerSubmission";
import { useBackgroundCommandActions } from "@/features/composer/hooks/useBackgroundCommandActions";
import { useI18n } from "@/shared/i18n";
import {
  resolveMainChatRuntime,
} from "@/features/runs/lib/runRuntimeState";
import type { LiveQuerySession } from "@/features/conversation/lib/conversationSession";

export {
  buildCompactUsageSnapshot,
  latestUsageSnapshotFromEvents,
} from "@/features/composer/hooks/useBackgroundCommandActions";

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
  mainChatRunning: boolean;
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
    | "currentChatActiveRun"
    | "currentRunAgentKey"
    | "rightSidebarOpen"
    | "events"
    | "pendingNewChatAgentKey"
    | "planningMode"
    | "runAgentById"
    | "runId"
    | "usageSnapshot"
    | "workerIndexByKey"
    | "workerSelectionKey"
  > & {
    pendingSteers: AppState["pendingSteers"];
  };
  stateRef: MutableRefObject<AppState>;
  querySessionsRef: MutableRefObject<Map<string, LiveQuerySession>>;
  activeQuerySessionRequestIdRef: MutableRefObject<string>;
  stopSpeechInput: () => void;
  textareaRef: RefObject<TextAreaRef>;
  updateMentionSuggestions: (value: string) => void;
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
    mainChatRunning,
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
    querySessionsRef,
    activeQuerySessionRequestIdRef,
    stopSpeechInput,
    textareaRef,
    updateMentionSuggestions,
  } = input;
  const { t } = useI18n();
  const { message: messageApi } = AntdApp.useApp();
  const { openBTW } = useBTW();
  const [steerSubmitting, setSteerSubmitting] = useState(false);
  const pendingSendRef = useRef(false);
  const pendingSentMessageRef = useRef("");
  const {
    submitRememberCommand,
    submitLearnCommand,
    submitCompactCommand,
  } = useBackgroundCommandActions({
    dispatch,
    state: {
      chatId: state.chatId,
      events: state.events,
      usageSnapshot: state.usageSnapshot,
    },
    text: {
      remember: {
        pending: backgroundCommandText.rememberPending,
        error: backgroundCommandText.rememberError,
      },
      learn: {
        pending: backgroundCommandText.learnPending,
        error: backgroundCommandText.learnError,
      },
      compact: {
        pending: backgroundCommandText.compactPending,
        error: backgroundCommandText.compactError,
      },
    },
  });

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

  const prevMainChatRunningRef = useRef(mainChatRunning);
  useEffect(() => {
    const wasRunning = prevMainChatRunningRef.current;
    prevMainChatRunningRef.current = mainChatRunning;
    const steers = state.pendingSteers[String(state.chatId || "")] || [];
    if (!wasRunning || mainChatRunning || steers.length === 0) {
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
  }, [mainChatRunning, state.pendingSteers, state.chatId, dispatch]);

  const resolveCurrentRunId = useCallback(() => {
    const currentState = stateRef.current || state;
    const activeRun = currentState.currentChatActiveRun;
    if (
      activeRun?.runId &&
      activeRun.chatId === String(currentState.chatId || "").trim()
    ) {
      return String(activeRun.runId || "").trim();
    }
    return resolveActiveRunId({
      stateRunId: currentState.runId,
      events: currentState.events,
    });
  }, [state, stateRef]);

  const resolveCurrentOwner = useCallback(() => {
    const currentState = stateRef.current || state;
    return resolveRunOwner({
      chatId: currentState.chatId,
      chats: currentState.chats,
      fallbackOwner: resolvePreferredRunOwner(currentState),
    });
  }, [resolveCurrentRunId, state, stateRef]);

  const resetForNewConversation = useCallback(() => {
    clearComposerAttachments();
    const currentState = stateRef.current || state;
    const owner = resolveCurrentOwner();
    const agentKey = owner?.kind === "agent" ? owner.agentKey : "";
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
  }, [clearComposerAttachments, resolveCurrentOwner, state, stateRef]);

  const interruptCurrentRun = useCallback(async () => {
    const chatId = String(state.chatId || "").trim();
    const runId = resolveCurrentRunId();
    const requestId = createRequestId("req");
    const owner = resolveCurrentOwner();
    if (!chatId || !runId || !owner) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[interrupt] skipped: missing chatId/runId/owner (chatId=${chatId || "-"}, runId=${runId || "-"})`,
      });
      return;
    }

    try {
      await interruptChat({
        requestId,
        chatId,
        runId,
        owner,
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
    resolveCurrentOwner,
    resolveCurrentRunId,
    state.abortController,
    state.chatId,
    state.planningMode,
  ]);

  const executeSlashCommand = useSlashCommandExecution({
    slashAvailability: executeSlashCommandInput.slashAvailability,
    closeMention,
    latestQueryText: executeSlashCommandInput.latestQueryText,
    resetForNewConversation,
    dispatch,
    toggleVoiceMode: executeSlashCommandInput.toggleVoiceMode,
    submitRememberCommand,
    submitLearnCommand,
    submitCompactCommand,
    setInputValue,
    setSlashDismissed,
    openBTW: () => {
      openBTW({
        accessLevel,
        model: modelOverride,
        params: controlParams,
      });
    },
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
    const activeChatId = String(currentState.chatId || "").trim();
    const btwMessage = parseBTWSlashInput(message);
    if (btwMessage !== null) {
      if (!activeChatId) {
        void messageApi.warning(t("btw.noChat"));
        return;
      }
      openBTW({
        parentChatId: activeChatId,
        message: btwMessage,
        references: sendReferences,
        attachments: sendAttachmentMeta,
        accessLevel,
        model: modelOverride,
        params: controlParams,
        sendImmediately: Boolean(btwMessage),
      });
      setInputValue("");
      if (btwMessage) {
        clearComposerAttachments();
      }
      setSlashDismissed(false);
      closeMention();
      return;
    }
    const mainRuntime = resolveMainChatRuntime(
      currentState,
      activeQuerySessionRequestIdRef,
      querySessionsRef,
    );
    if (mainRuntime.running) {
      const activeRunId = mainRuntime.runId || resolveCurrentRunId();
      if (!activeChatId || !activeRunId) {
        dispatch({
          type: "APPEND_DEBUG",
          line: `[send] recovered stale main chat runtime before submit (chatId=${activeChatId || "-"}, runId=${activeRunId || "-"})`,
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
    const owner = resolvePreferredRunOwner(currentState, {
      chatId: pendingChatId,
    });
    if (pendingChatId && !String(currentState.chatId || "").trim() && !owner) {
      pendingSendRef.current = false;
      pendingSentMessageRef.current = "";
      dispatch({
        type: "APPEND_DEBUG",
        line: `[send] skipped: missing owner for pending uploaded chat (chatId=${pendingChatId})`,
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
          ...(owner?.kind === "agent" ? { agentKey: owner.agentKey } : {}),
          ...(owner?.kind === "orchestrated-team" ? { teamId: owner.teamId } : {}),
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
    messageApi,
    openBTW,
    activeQuerySessionRequestIdRef,
    querySessionsRef,
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
    state.currentChatActiveRun,
    state.pendingNewChatAgentKey,
    state.workerIndexByKey,
    state.workerSelectionKey,
    stateRef,
    stopSpeechInput,
    t,
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
    const owner = resolveCurrentOwner();
    if (!chatId || !steer.runId || !owner) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[steer] skipped: missing chatId/runId/owner (chatId=${chatId || "-"}, runId=${steer.runId || "-"})`,
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
        owner,
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
    resolveCurrentOwner,
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
