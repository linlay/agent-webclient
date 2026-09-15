import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import { App as AntdApp } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import type { AppAction } from "@/app/state/AppContext";
import type { AppState } from "@/app/state/AppContext";
import {
  createRequestId,
  type QueryAccessLevel,
  type QueryModelOverride,
} from "@/shared/data";
import { useRunTransport } from "@/features/transport/hooks/useRealtimeTransport";
import {
  resolvePreferredRunOwner,
  resolveRunOwner,
} from "@/features/runs/lib/runOwner";
import { useSlashCommandExecution } from "@/features/composer/hooks/useSlashCommandExecution";
import type {
  ResolvedSlashSkillDefinition,
  SlashCommandAvailability,
  SlashCommandId,
  SlashPaletteItem,
} from "@/features/composer/lib/slashCommands";
import { parseBTWSlashInput, parseCompactSlashInput } from "@/features/composer/lib/slashCommands";
import { useBTW } from "@/features/btw/components/BtwProvider";
import {
  normalizeSteerSubmissionResponse,
  resolveActiveRunId,
} from "@/features/composer/lib/steerSubmission";
import { normalizeTimelineAttachments } from "@/features/events/lib/timelineAttachments";
import { findPendingSteer } from "@/features/composer/lib/pendingSteers";
import { useBackgroundCommandActions } from "@/features/composer/hooks/useBackgroundCommandActions";
import { useCompactChooser } from "@/features/composer/hooks/useCompactChooser";
import { useI18n } from "@/shared/i18n";
import { parseLeadingAgentMention } from "@/features/composer/lib/mentionParser";
import { resolveMentionCandidatesFromState } from "@/features/composer/lib/mentionCandidates";
import {
  resolveMainChatRuntime,
} from "@/features/runs/lib/runRuntimeState";
import { resolveCurrentWorkerSummary, supportsActiveRunContextCompact } from "@/features/workers/lib/currentWorker";
import { canSubmitCompact, resolveCompactPhase } from "@/features/runs/lib/contextCompact";
import type { LiveQuerySession } from "@/features/conversation/lib/conversationSession";

export {
  buildCompactUsageSnapshot,
  latestUsageSnapshotFromEvents,
} from "@/features/composer/hooks/useBackgroundCommandActions";

type ComposerSendAttachmentMeta = {
  id?: string;
  name: string;
  size: number;
  type?: string;
  mimeType?: string;
  url?: string;
  meta?: Record<string, unknown>;
};

interface UseComposerSendInput {
  attachmentChatId: string;
  accessLevel: QueryAccessLevel;
  clearComposerAttachments: () => void;
  clearMustUseSkills: () => void;
  closeMention: () => void;
  controlParams: Record<string, unknown>;
  dispatch: Dispatch<AppAction>;
  executeSlashCommandInput: {
    closeMention: () => void;
    latestQueryText: string;
    setInputValue: (value: string) => void;
    setSlashDismissed: (dismissed: boolean) => void;
    slashAvailability: SlashCommandAvailability;
    state: Pick<AppState, "rightSidebarOpen" | "planningMode" | "editingMode" | "chatId" | "runId" | "usagePopoverOpen">;
    toggleVoiceMode: () => void;
  };
  backgroundCommandText: {
    rememberPending: string;
    rememberError: string;
    learnPending: string;
    learnError: string;
    compactPending: string;
    compactError: string;
    compactWaiting?: string;
    compactCompacting?: string;
    compactToolsCompacting?: string;
    compactSummaryCompacting?: string;
  };
  hasUploadingAttachments: boolean;
  hasFailedAttachments?: boolean;
  inputValue: string;
  isAwaitingActive: boolean;
  isVoiceMode: boolean;
  mainChatRunning: boolean;
  modelOverride: QueryModelOverride;
  mustUseSkillsAgentKey: string;
  mustUseSkills: string[];
  selectSlashItem: () => SlashPaletteItem | null;
  onSelectSlashSkill: (skill: ResolvedSlashSkillDefinition) => void;
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
    | "editingMode"
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
    clearMustUseSkills,
    closeMention,
    controlParams,
    dispatch,
    executeSlashCommandInput,
    backgroundCommandText,
    hasUploadingAttachments,
    hasFailedAttachments,
    inputValue,
    isAwaitingActive,
    isVoiceMode,
    mainChatRunning,
    modelOverride,
    mustUseSkillsAgentKey,
    mustUseSkills,
    selectSlashItem,
    onSelectSlashSkill,
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
  const runs = useRunTransport();
  const { message: messageApi } = AntdApp.useApp();
  const { openBTW } = useBTW();
  const pendingSendRef = useRef(false);
  const pendingSentMessageRef = useRef("");
  const interruptSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    submitRememberCommand,
    submitLearnCommand,
    submitCompactCommand,
  } = useBackgroundCommandActions({
    canCompact: !mainChatRunning || supportsActiveRunContextCompact(resolveCurrentWorkerSummary(stateRef.current)),
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
        waiting: backgroundCommandText.compactWaiting,
        compacting: backgroundCommandText.compactCompacting,
        toolsCompacting: backgroundCommandText.compactToolsCompacting,
        summaryCompacting: backgroundCommandText.compactSummaryCompacting,
      },
    },
  });

  const openCompactChooser = useCompactChooser(submitCompactCommand);

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

  useEffect(() => {
    return () => {
      if (interruptSafetyTimerRef.current) {
        clearTimeout(interruptSafetyTimerRef.current);
        interruptSafetyTimerRef.current = null;
      }
    };
  }, []);

  const prevMainRuntimeRef = useRef({ chatId: state.chatId, runId: state.runId, running: mainChatRunning });
  useEffect(() => {
    const currentState = stateRef.current;
    const runtime = resolveMainChatRuntime(currentState, activeQuerySessionRequestIdRef, querySessionsRef);
    const previous = prevMainRuntimeRef.current;
    prevMainRuntimeRef.current = { chatId: currentState.chatId, runId: runtime.runId || currentState.runId, running: mainChatRunning };
    if (!previous.running || mainChatRunning || runtime.running || previous.chatId !== currentState.chatId ||
      (runtime.runId && runtime.runId !== previous.runId) ||
      (currentState.chatTransition && currentState.chatTransition.phase !== "ready")) return;
    const firstQueued = currentState.pendingSteers[currentState.chatId]?.find(
      steer => steer.status === "queued",
    );
    if (!firstQueued) return;
    dispatch({ type: "REMOVE_PENDING_STEER", chatId: currentState.chatId, runId: firstQueued.runId, steerId: firstQueued.steerId });
    window.dispatchEvent(
      new CustomEvent("agent:send-message", {
        detail: { message: firstQueued.message, chatId: currentState.chatId, ...(firstQueued.references?.length ? { references: firstQueued.references, attachments: normalizeTimelineAttachments(firstQueued.references) } : {}) },
      }),
    );
  }, [mainChatRunning, state.pendingSteers, state.chatId, state.runId, dispatch, stateRef, activeQuerySessionRequestIdRef, querySessionsRef]);

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
          preserveWorkerContext: true,
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
      await runs.interrupt({
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

      // 停止语音，但不立即 abort 流 — 等待后端推送 run.cancel 事件
      window.dispatchEvent(
        new CustomEvent("agent:voice-stop-all", {
          detail: { reason: "interrupt", mode: "stop" },
        }),
      );

      // 安全超时：如果 5 秒内未收到 run.cancel，强制 abort 流
      interruptSafetyTimerRef.current = setTimeout(() => {
        const ac = stateRef.current.abortController;
        if (ac) {
          dispatch({
            type: "APPEND_DEBUG",
            line: `[interrupt] safety timeout: forcing stream abort`,
          });
          ac.abort();
        }
        interruptSafetyTimerRef.current = null;
      }, 5000);
    } catch (error) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[interrupt] failed: ${(error as Error).message}`,
      });
      // 中断请求失败时立即 abort 流作为回退
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
    runs,
    state.abortController,
    state.chatId,
    state.planningMode,
    stateRef,
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
    submitCompactCommand: openCompactChooser,
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

    const selectedSlashItem = showSlashPalette ? selectSlashItem() : null;
    if (selectedSlashItem) {
      if (selectedSlashItem.kind === "command") {
        void executeSlashCommand(selectedSlashItem.id);
      } else {
        onSelectSlashSkill(selectedSlashItem);
      }
      return;
    }

    const message = inputValue.trim();
    if (!message && sendReferences.length === 0) return;
    if (hasUploadingAttachments || hasFailedAttachments) return;
    if (pendingSendRef.current && pendingSentMessageRef.current === message) {
      return;
    }
    const currentState = stateRef.current || state;
    const activeChatId = String(currentState.chatId || "").trim();
    const compactAction = parseCompactSlashInput(message);
    if (compactAction !== null) {
      if (!activeChatId) {
        void messageApi.warning(t("contextCompact.noChat"));
        return;
      }
      if (!canSubmitCompact(activeChatId, mainChatRunning, supportsActiveRunContextCompact(resolveCurrentWorkerSummary(stateRef.current)), Boolean(resolveCompactPhase(currentState.events, activeChatId)))) return;
      setInputValue("");
      setSlashDismissed(false);
      closeMention();
      if (compactAction === "chooser") {
        void openCompactChooser();
      } else {
        void submitCompactCommand(compactAction);
      }
      return;
    }
    const btwMessage = parseBTWSlashInput(message);
    if (btwMessage !== null) {
      if (mustUseSkills.length > 0) {
        void messageApi.warning(t("composer.addMenu.skill.btwUnsupported"));
        return;
      }
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
        // Selection references remain in the Composer until a normal query accepts them.
        if (!message) return;
        if (mustUseSkills.length > 0) {
          dispatch({
            type: "APPEND_DEBUG",
            line: "[send] required skills are not supported while steering an active run",
          });
          return;
        }
        const steerId =
          typeof globalThis.crypto?.randomUUID === "function"
            ? globalThis.crypto.randomUUID()
            : createRequestId("steer");
        dispatch({
          type: "ENQUEUE_PENDING_STEER",
          chatId: activeChatId,
          steer: {
            steerId,
            message,
            requestId: createRequestId("req"),
            runId: activeRunId,
            createdAt: Date.now(),
            status: "queued",
            references: structuredClone(sendReferences.filter((reference) =>
              !reference || typeof reference !== "object" ||
              (reference as { type?: unknown }).type !== "selection",
            )),
          },
        });
        setInputValue("");
        dispatch({ type: "SET_COMPOSER_DRAFT", draft: "" });
        clearComposerAttachments();
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
    if (mustUseSkills.length > 0) {
      const mention = parseLeadingAgentMention(
        message,
        resolveMentionCandidatesFromState(currentState),
      );
      const finalAgentKey =
        owner?.kind === "agent"
          ? mention.mentionAgentKey || owner.agentKey
          : "";
      if (
        !mustUseSkillsAgentKey ||
        finalAgentKey !== mustUseSkillsAgentKey
      ) {
        pendingSendRef.current = false;
        pendingSentMessageRef.current = "";
        void messageApi.warning(
          t("composer.addMenu.skill.routeMismatch"),
        );
        return;
      }
    }

    setInputValue("");
    dispatch({ type: "SET_COMPOSER_DRAFT", draft: "" });
    clearComposerAttachments();
    clearMustUseSkills();
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
          editingMode: currentState.editingMode === true,
          mustUseSkillsAgentKey,
          mustUseSkills,
        },
      }),
    );
  }, [
    attachmentChatId,
    accessLevel,
    clearComposerAttachments,
    clearMustUseSkills,
    closeMention,
    controlParams,
    dispatch,
    executeSlashCommand,
    hasUploadingAttachments,
    hasFailedAttachments,
    inputValue,
    isAwaitingActive,
    isVoiceMode,
    modelOverride,
    mustUseSkillsAgentKey,
    mustUseSkills,
    messageApi,
    openCompactChooser,
    openBTW,
    activeQuerySessionRequestIdRef,
    querySessionsRef,
    resolveCurrentRunId,
    selectSlashItem,
    onSelectSlashSkill,
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
    state.editingMode,
    state.pendingNewChatAgentKey,
    state.workerIndexByKey,
    state.workerSelectionKey,
    stateRef,
    stopSpeechInput,
    submitCompactCommand,
    t,
  ]);

  const handleSteer = useCallback(async (steerId: string) => {
    const currentState = stateRef.current;
    const chatId = String(currentState.chatId || "").trim();
    const steer = findPendingSteer(currentState.pendingSteers, { chatId, steerId })?.steer;
    if (!steer || steer.status !== "queued") return;

    const target = { chatId, runId: steer.runId, steerId };
    const owner = resolveCurrentOwner();
    if (!chatId || !steer.runId || !owner) {
      dispatch({ type: "RESTORE_PENDING_STEER", ...target });
      void messageApi.warning(t("composer.steer.unavailable"));
      return;
    }

    dispatch({ type: "UPDATE_PENDING_STEER_STATUS", ...target, status: "sending" });
    const retainForConfirmation = (detail: string) => {
      if (!findPendingSteer(stateRef.current.pendingSteers, target)) return;
      dispatch({ type: "SET_PENDING_STEER_ERROR", ...target, error: detail });
      dispatch({ type: "APPEND_DEBUG", line: `[steer] awaiting confirmation for chatId=${chatId}, steerId=${steerId}: ${detail}` });
    };
    try {
      const response = await runs.steer({
        requestId: steer.requestId,
        chatId,
        runId: steer.runId,
        steerId: steer.steerId,
        owner,
        message: steer.message,
        references: steer.references,
        planningMode: Boolean(currentState.planningMode),
      });
      // The stream can acknowledge the message before the control response.
      if (!findPendingSteer(stateRef.current.pendingSteers, target)) return;
      const result = normalizeSteerSubmissionResponse(response);
      if (result.accepted === null) {
        retainForConfirmation(result.detail || result.status);
        return;
      }
      if (!result.accepted) {
        dispatch({ type: "RESTORE_PENDING_STEER", ...target });
        dispatch({ type: "APPEND_DEBUG", line: `[steer] rejected: status=${result.status || "-"}, detail=${result.detail || "-"}` });
        if (stateRef.current.chatId === chatId) {
          void messageApi.warning(t("composer.steer.rejected", { detail: result.detail || result.status || "unmatched" }));
        }
        return;
      }
      dispatch({
        type: "APPEND_DEBUG",
        line: `[steer] submitted for chatId=${chatId}, runId=${steer.runId}, requestId=${steer.requestId}`,
      });
    } catch (error) {
      // A lost response does not establish whether the server accepted the steer.
      retainForConfirmation(error instanceof Error ? error.message : String(error));
    }
  }, [dispatch, resolveCurrentOwner, runs, messageApi, stateRef, t]);

  const handleCancelSteer = useCallback((steerId: string) => {
    const currentState = stateRef.current;
    const chatId = currentState.chatId;
    const steer = findPendingSteer(currentState.pendingSteers, { chatId, steerId })?.steer;
    if (!steer) return;
    const runtime = resolveMainChatRuntime(currentState, activeQuerySessionRequestIdRef, querySessionsRef);
    if (steer.status === "sending" && runtime.running) return;
    dispatch({ type: "RESTORE_PENDING_STEER", chatId, runId: steer.runId, steerId });
  }, [dispatch, stateRef, activeQuerySessionRequestIdRef, querySessionsRef]);

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
  };
}
