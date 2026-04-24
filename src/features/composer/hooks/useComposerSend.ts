import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { TextAreaRef } from "antd/es/input/TextArea";
import type { AppAction } from "@/app/state/AppContext";
import type { AppState } from "@/app/state/types";
import { createRequestId } from "@/shared/api/apiClient";
import {
  interruptChat,
  learnChat,
  rememberChat,
  steerChat,
} from "@/features/transport/lib/apiClientProxy";
import {
  resolvePreferredAgentKey,
  resolvePreferredTeamId,
} from "@/features/composer/lib/queryRouting";
import { useSlashCommandExecution } from "@/features/composer/hooks/useSlashCommandExecution";
import type {
  SlashCommandAvailability,
  SlashCommandId,
} from "@/features/composer/lib/slashCommands";

type ComposerSendAttachmentMeta = {
  name: string;
  size: number;
  type?: string;
  mimeType?: string;
  url?: string;
};

interface UseComposerSendInput {
  attachmentChatId: string;
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
    state: Pick<AppState, "desktopDebugSidebarEnabled" | "planningMode">;
    toggleVoiceMode: () => void;
  };
  backgroundCommandText: {
    rememberPending: string;
    rememberError: string;
    learnPending: string;
    learnError: string;
  };
  hasUploadingAttachments: boolean;
  inputValue: string;
  isAwaitingActive: boolean;
  isVoiceMode: boolean;
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
    | "desktopDebugSidebarEnabled"
    | "events"
    | "pendingNewChatAgentKey"
    | "planningMode"
    | "runId"
    | "steerDraft"
    | "streaming"
    | "workerIndexByKey"
    | "workerSelectionKey"
  > & {
    pendingSteers: AppState["pendingSteers"];
  };
  stopSpeechInput: () => void;
  textareaRef: RefObject<TextAreaRef>;
  updateMentionSuggestions: (value: string) => void;
}

function appendTextBlock(base: string, extra: string): string {
  const nextExtra = String(extra || "");
  if (!nextExtra.trim()) return base;
  if (!base.trim()) return nextExtra;
  return `${base}${base.endsWith("\n") ? "" : "\n"}${nextExtra}`;
}

export function useComposerSend(input: UseComposerSendInput) {
  const {
    attachmentChatId,
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
    selectSlashCommand,
    showSlashPalette,
    sendAttachmentMeta,
    sendReferences,
    setInputValue,
    setSlashDismissed,
    speechListening,
    state,
    stopSpeechInput,
    textareaRef,
    updateMentionSuggestions,
  } = input;
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

  const resolveCurrentRunId = useCallback(() => {
    const fromState = String(state.runId || "").trim();
    if (fromState) return fromState;

    for (let i = state.events.length - 1; i >= 0; i -= 1) {
      const event = state.events[i];
      const rid = String((event as { runId?: string }).runId || "").trim();
      if (rid) return rid;
    }
    return "";
  }, [state.events, state.runId]);

  const resolveCurrentAgentKey = useCallback(() => {
    return resolvePreferredAgentKey({
      chatId: state.chatId,
      chatAgentById: state.chatAgentById,
      pendingNewChatAgentKey: state.pendingNewChatAgentKey,
      workerSelectionKey: state.workerSelectionKey,
      workerIndexByKey: state.workerIndexByKey,
    });
  }, [
    state.chatAgentById,
    state.chatId,
    state.pendingNewChatAgentKey,
    state.workerIndexByKey,
    state.workerSelectionKey,
  ]);

  const resolveCurrentTeamId = useCallback(() => {
    return resolvePreferredTeamId({
      chatId: state.chatId,
      chatAgentById: state.chatAgentById,
      pendingNewChatAgentKey: state.pendingNewChatAgentKey,
      workerSelectionKey: state.workerSelectionKey,
      workerIndexByKey: state.workerIndexByKey,
    });
  }, [
    state.chatAgentById,
    state.chatId,
    state.pendingNewChatAgentKey,
    state.workerIndexByKey,
    state.workerSelectionKey,
  ]);

  const resetForNewConversation = useCallback(() => {
    clearComposerAttachments();
    window.dispatchEvent(
      new CustomEvent("agent:start-new-conversation", {
        detail: { focusComposerOnComplete: true },
      }),
    );
  }, [clearComposerAttachments]);

  const interruptCurrentRun = useCallback(async () => {
    const chatId = String(state.chatId || "").trim();
    const runId = resolveCurrentRunId();
    const requestId = createRequestId("req");
    const agentKey = resolveCurrentAgentKey();
    const teamId = resolveCurrentTeamId();
    if (!chatId || !runId) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[interrupt] skipped: missing chatId/runId (chatId=${chatId || "-"}, runId=${runId || "-"})`,
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
      commandType: "remember" | "learn",
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
      commandType: "remember" | "learn",
      texts: { pending: string; error: string },
    ) => {
      const chatId = String(state.chatId || "").trim();
      if (!chatId) {
        return;
      }

      const requestId = createRequestId(commandType);
      triggerCommandStatusOverlay(commandType, "pending", texts.pending);

      try {
        const request = commandType === "remember" ? rememberChat : learnChat;
        await request({
          requestId,
          chatId,
        });
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
    interruptCurrentRun,
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
    if (!message && sendReferences.length === 0) return;
    if (hasUploadingAttachments) return;
    if (pendingSendRef.current && pendingSentMessageRef.current === message) {
      return;
    }
    if (state.streaming) {
      if (sendReferences.length > 0) {
        dispatch({
          type: "APPEND_DEBUG",
          line: "[upload] attachments are not supported while steering an active run",
        });
        return;
      }
      dispatch({ type: "SET_STEER_DRAFT", draft: message });
      setInputValue("");
      setSlashDismissed(false);
      closeMention();
      return;
    }
    pendingSendRef.current = true;
    pendingSentMessageRef.current = message;
    const pendingChatId = String(state.chatId || attachmentChatId || "").trim();
    const agentKey = resolvePreferredAgentKey({
      chatId: pendingChatId,
      chatAgentById: state.chatAgentById,
      pendingNewChatAgentKey: state.pendingNewChatAgentKey,
      workerSelectionKey: state.workerSelectionKey,
      workerIndexByKey: state.workerIndexByKey,
    });
    const teamId = resolvePreferredTeamId({
      chatId: pendingChatId,
      chatAgentById: state.chatAgentById,
      pendingNewChatAgentKey: state.pendingNewChatAgentKey,
      workerSelectionKey: state.workerSelectionKey,
      workerIndexByKey: state.workerIndexByKey,
    });
    if (pendingChatId && !String(state.chatId || "").trim() && !agentKey) {
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
          params: controlParams,
        },
      }),
    );
  }, [
    attachmentChatId,
    clearComposerAttachments,
    closeMention,
    controlParams,
    dispatch,
    executeSlashCommand,
    hasUploadingAttachments,
    inputValue,
    isAwaitingActive,
    isVoiceMode,
    selectSlashCommand,
    sendAttachmentMeta,
    sendReferences,
    setInputValue,
    setSlashDismissed,
    showSlashPalette,
    speechListening,
    state.chatAgentById,
    state.chatId,
    state.pendingNewChatAgentKey,
    state.streaming,
    state.workerIndexByKey,
    state.workerSelectionKey,
    stopSpeechInput,
  ]);

  const handleSteer = useCallback(async () => {
    const message = state.steerDraft.trim();
    if (!message || !state.streaming || steerSubmitting) return;

    const chatId = String(state.chatId || "").trim();
    const runId = resolveCurrentRunId();
    const requestId = createRequestId("req");
    const steerId =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : createRequestId("steer");
    const agentKey = resolveCurrentAgentKey();
    const teamId = resolveCurrentTeamId();
    if (!chatId || !runId) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[steer] skipped: missing chatId/runId (chatId=${chatId || "-"}, runId=${runId || "-"})`,
      });
      return;
    }

    setSteerSubmitting(true);
    try {
      await steerChat({
        requestId,
        chatId,
        runId,
        steerId,
        agentKey: agentKey || undefined,
        teamId: teamId || undefined,
        message,
        planningMode: Boolean(state.planningMode),
      });
      dispatch({
        type: "APPEND_DEBUG",
        line: `[steer] submitted for chatId=${chatId}, runId=${runId}, requestId=${requestId}`,
      });
      dispatch({
        type: "ENQUEUE_PENDING_STEER",
        steer: {
          steerId,
          message,
          requestId,
          runId,
          createdAt: Date.now(),
        },
      });
      dispatch({ type: "SET_STEER_DRAFT", draft: "" });
    } catch (error) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[steer] failed: ${(error as Error).message}`,
      });
    } finally {
      setSteerSubmitting(false);
    }
  }, [
    dispatch,
    resolveCurrentAgentKey,
    resolveCurrentRunId,
    resolveCurrentTeamId,
    state.chatId,
    state.planningMode,
    state.steerDraft,
    state.streaming,
    steerSubmitting,
  ]);

  const handleCancelSteer = useCallback(() => {
    const draft = String(state.steerDraft || "");
    dispatch({ type: "SET_STEER_DRAFT", draft: "" });
    setInputValue(draft);
    setSlashDismissed(false);
    updateMentionSuggestions(draft);
    window.requestAnimationFrame(() => {
      const el = textareaRef.current?.resizableTextArea?.textArea;
      if (!el) return;
      el.focus();
      const caret = draft.length;
      el.setSelectionRange(caret, caret);
    });
  }, [
    dispatch,
    setInputValue,
    setSlashDismissed,
    state.steerDraft,
    textareaRef,
    updateMentionSuggestions,
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

  const shouldMergeSteersIntoInput =
    !state.streaming && !steerSubmitting;

  const mergedSteerDraft = useMemo(() => {
    if (!shouldMergeSteersIntoInput) {
      return null;
    }

    let nextValue = inputValue;
    let changed = false;

    const draft = String(state.steerDraft || "");
    if (draft.trim()) {
      nextValue = appendTextBlock(nextValue, draft);
      changed = true;
    }

    const pendingText = state.pendingSteers
      .map((steer) => String(steer.message || "").trim())
      .filter(Boolean)
      .join("\n");
    if (pendingText) {
      nextValue = appendTextBlock(nextValue, pendingText);
      changed = true;
    }

    if (!changed) {
      return null;
    }

    return {
      nextValue,
      draft,
      hasPendingSteers: state.pendingSteers.length > 0,
    };
  }, [
    inputValue,
    shouldMergeSteersIntoInput,
    state.pendingSteers,
    state.steerDraft,
  ]);

  return {
    applyComposerDraft,
    executeSlashCommand,
    handleCancelSteer,
    handleSend,
    handleSteer,
    interruptCurrentRun,
    mergedSteerDraft,
    pendingSentMessageRef,
    pendingSendRef,
    resetForNewConversation,
    setSteerSubmitting,
    steerSubmitting,
  };
}
