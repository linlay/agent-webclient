import { isEmbedMode } from "@/shared/config/embed";
import { withEmbedContext } from "@/shared/data/embed/hostContext";
import { currentChatUsesMailboxSend } from "@/features/composer/lib/messageEntry";
import type { PendingSteer } from "@/features/composer/lib/composerState";
import { isAgentExecutionBlocked } from "@/features/agents/lib/agentAvailability";
import { useCallback, useEffect, useRef } from "react";
import { referenceIds } from "@/shared/contracts/references";
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
  SlashSkillItem,
  SlashCommandAvailability,
  SlashPaletteItem,
} from "@/features/composer/lib/slashCommands";
import { isSlashCommandDisabled, parseBTWSlashInput, parseCompactSlashInput, parseDetailSlashInput } from "@/features/composer/lib/slashCommands";
import { useBTW } from "@/features/btw/components/BtwProvider";
import { sendBtwLaunch, type BtwLaunch } from "@/features/btw/lib/btwLaunchTransfer";
import { buildDesktopWorkPanelDescriptor } from "@/features/surfaces/lib/openTarget";
import { useOptionalWorkPanelTransport } from "@/features/transport/components/RealtimeTransportProvider";
import { DESKTOP_SELECTION_BTW_TARGET } from "@/features/selection/lib/selectionTransfer";
import { isDesktopAppMode } from "@/shared/utils/routing";
import {
  normalizeSteerSubmissionResponse,
  resolveActiveRunId,
} from "@/features/composer/lib/steerSubmission";
import { normalizeTimelineAttachments } from "@/features/events/lib/timelineAttachments";
import { findPendingSteer } from "@/features/composer/lib/pendingSteers";
import { useBackgroundCommandActions } from "@/features/composer/hooks/useBackgroundCommandActions";
import { useCompactChooser } from "@/features/composer/hooks/useCompactChooser";
import { reloadChatDetails } from "@/features/composer/lib/chatDetails";
import { useI18n } from "@/shared/i18n";
import { parseLeadingAgentMention } from "@/features/composer/lib/mentionParser";
import { resolveMentionCandidatesFromState } from "@/features/composer/lib/mentionCandidates";
import {
  resolveMainChatRuntime,
} from "@/features/runs/lib/runRuntimeState";
import { resolveCurrentWorkerSummary, supportsActiveRunContextCompact } from "@/features/workers/lib/currentWorker";
import { canSubmitCompact, resolveCompactPhase } from "@/features/runs/lib/contextCompact";
import type { LiveQuerySession } from "@/features/conversation/lib/conversationSession";
import { notifySelectedTextReferencesAccepted } from "@/features/selection/lib/selectedTextReference";
import { canContinueChat, hasQueryHistory, hasSendableContent, hasSendableQuery } from "@/features/composer/lib/sendEligibility";

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
  accessLevel?: QueryAccessLevel;
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
  editingModeAvailable?: boolean;
  modelOverride: QueryModelOverride;
  skillReferenceAgentKey: string;
  selectSlashItem: () => SlashPaletteItem | null;
  onSelectSlashSkill: (skill: SlashSkillItem) => void;
  showSlashPalette: boolean;
  sendAttachmentMeta: ComposerSendAttachmentMeta[];
  sendReferences: unknown[];
  setInputValue: Dispatch<SetStateAction<string>>;
  setSlashDismissed: Dispatch<SetStateAction<boolean>>;
  speechListening: boolean;
  state: Pick<
    AppState,
    | "abortController"
    | "agentAvailability"
    | "chatTransition"
    | "chatSurfaceBlocked"
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
  onRecordMessage?: (message: string) => void;
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
    hasFailedAttachments,
    inputValue,
    isAwaitingActive,
    isVoiceMode,
    mainChatRunning,
    editingModeAvailable = false,
    modelOverride,
    skillReferenceAgentKey,
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
    onRecordMessage,
  } = input;
  const { t } = useI18n();
  const runs = useRunTransport();
  const { message: messageApi } = AntdApp.useApp();
  const { openBTW } = useBTW();
  const workPanel = useOptionalWorkPanelTransport();
  const openingBtwChats = useRef(new Set<string>());
  const pendingSendRef = useRef(false);
  const pendingSentMessageRef = useRef("");
  const pendingSentReferencesRef = useRef("");
  const referenceSignature = JSON.stringify(sendReferences);
  const btwDraftRef = useRef({ inputValue, referenceSignature });
  btwDraftRef.current = { inputValue, referenceSignature };
  const interruptSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
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
  const showChatDetails = useCallback(() => {
    const current = stateRef.current;
    const chatId = String(current.chatId || "").trim();
    const detail = current.chats.find(chat => chat.chatId === chatId)?.display?.effectiveDetail;
    if (chatId && detail === "simple") reloadChatDetails(chatId);
  }, [stateRef]);

  useEffect(() => {
    const message = isEmbedMode() ? withEmbedContext(inputValue.trim()) : inputValue.trim();
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

  useEffect(() => {
    pendingSendRef.current = false;
  }, [mainChatRunning, state.chatId, state.runId, referenceSignature]);

  const prevMainRuntimeRef = useRef({ chatId: state.chatId, runId: state.runId, running: mainChatRunning });
  const pendingQueueContinuationRef = useRef<{ chatId: string; runId: string } | null>(null);
  useEffect(() => {
    const currentState = stateRef.current;
    const runtime = resolveMainChatRuntime(currentState, activeQuerySessionRequestIdRef, querySessionsRef);
    const previous = prevMainRuntimeRef.current;
    const runId = runtime.runId || currentState.runId;
    prevMainRuntimeRef.current = { chatId: currentState.chatId, runId, running: mainChatRunning };
    // A temporary restore gate must not consume the running-to-idle edge.
    // Keep its identity until we can send, or a chat/run change invalidates it.
    if (previous.chatId !== currentState.chatId || mainChatRunning || runtime.running ||
      (runId && runId !== previous.runId)) {
      pendingQueueContinuationRef.current = null;
      return;
    }
    if (previous.running) {
      pendingQueueContinuationRef.current = { chatId: currentState.chatId, runId };
    }
    const continuation = pendingQueueContinuationRef.current;
    if (!continuation) return;
    if (continuation.chatId !== currentState.chatId || continuation.runId !== runId) {
      pendingQueueContinuationRef.current = null;
      return;
    }
    if ((currentState.chatTransition && currentState.chatTransition.phase !== "ready") ||
      currentState.chatSurfaceBlocked || isAgentExecutionBlocked(currentState)) return;
    // Claim before dispatching: synchronous updates and repeated effects must
    // never start two queries for the same completion.
    pendingQueueContinuationRef.current = null;
    const queued = (currentState.pendingSteers[currentState.chatId] || []).filter(steer => steer.status === "queued");
    const allowReferenceOnly = hasQueryHistory(currentState);
    const needsText = queued.filter(steer => !hasSendableContent(steer.message, steer.references, allowReferenceOnly));
    for (const steer of needsText) {
      // Without confirmed query history, keep reference-only content in the draft.
      dispatch({ type: "RESTORE_PENDING_STEER", chatId: currentState.chatId, runId: steer.runId, steerId: steer.steerId });
    }
    if (needsText.length) void messageApi.warning(t("composer.steer.addText"));
    const firstQueued = queued.find(steer => hasSendableContent(steer.message, steer.references, allowReferenceOnly));
    if (!firstQueued) return;
    dispatch({ type: "REMOVE_PENDING_STEER", chatId: currentState.chatId, runId: firstQueued.runId, steerId: firstQueued.steerId });
    window.dispatchEvent(
      new CustomEvent("agent:send-message", {
        detail: { message: firstQueued.message, chatId: currentState.chatId, ...(firstQueued.references?.length ? { references: firstQueued.references, attachments: normalizeTimelineAttachments(firstQueued.references) } : {}) },
      }),
    );
  }, [mainChatRunning, state.pendingSteers, state.chatId, state.runId, state.chatTransition, state.chatSurfaceBlocked, state.agentAvailability, dispatch, stateRef, activeQuerySessionRequestIdRef, querySessionsRef, messageApi, t]);

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
    if (stateRef.current.inputMode === "voice") {
      window.dispatchEvent(new CustomEvent("agent:voice-abort"));
      return;
    }
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

  const openBtwCommand = useCallback(async (message = "") => {
    const chatId = String(stateRef.current.chatId || "").trim();
    if (!chatId) {
      void messageApi.warning(t("btw.noChat"));
      return;
    }
    if (openingBtwChats.current.has(chatId)) return;
    const draft = btwDraftRef.current;
    const options: BtwLaunch = {
      accessLevel,
      model: modelOverride,
      params: controlParams,
      ...(message ? { message, references: sendReferences, attachments: sendAttachmentMeta } : {}),
    };
    try {
      if (isDesktopAppMode()) {
        openingBtwChats.current.add(chatId);
        const owner = resolveCurrentOwner();
        const launchTarget = message ? `btw-${crypto.randomUUID()}` : "";
        const target = launchTarget || DESKTOP_SELECTION_BTW_TARGET;
        const descriptor = buildDesktopWorkPanelDescriptor({
          version: 1,
          kind: "btw",
          chatId,
          agentKey: owner?.agentKey,
          instanceId: target,
          ...(launchTarget ? { btwLaunchTarget: launchTarget } : { selectionTransferTarget: target }),
          title: t("selection.sideChat.title"),
        }, window.location.search);
        if (!workPanel || !descriptor) throw new Error("Side chat WorkPanel is unavailable");
        await workPanel.openDescriptor(descriptor);
        if (!await sendBtwLaunch(chatId, target, options)) throw new Error("Side chat is not ready");
      } else if (!openBTW({ ...options, parentChatId: chatId, sendImmediately: Boolean(message) })) {
        throw new Error("Side chat is unavailable");
      }
    } catch {
      if (stateRef.current.chatId === chatId) void messageApi.warning(t("btw.openFailed"));
      return;
    } finally {
      openingBtwChats.current.delete(chatId);
    }
    const latest = btwDraftRef.current;
    if (stateRef.current.chatId !== chatId || latest.inputValue !== draft.inputValue ||
      (message && latest.referenceSignature !== draft.referenceSignature)) return;
    setInputValue("");
    if (message) clearComposerAttachments();
    setSlashDismissed(!message);
    closeMention();
  }, [
    accessLevel, clearComposerAttachments, closeMention, controlParams, messageApi, modelOverride, openBTW,
    resolveCurrentOwner, sendAttachmentMeta, sendReferences, setInputValue, setSlashDismissed, stateRef, t, workPanel,
  ]);

  const executeSlashCommand = useSlashCommandExecution({
    slashAvailability: executeSlashCommandInput.slashAvailability,
    closeMention,
    latestQueryText: executeSlashCommandInput.latestQueryText,
    resetForNewConversation,
    dispatch,
    toggleVoiceMode: executeSlashCommandInput.toggleVoiceMode,
    submitCompactCommand: openCompactChooser,
    setInputValue,
    setSlashDismissed,
    openBTW: openBtwCommand,
    showChatDetails,
    state: executeSlashCommandInput.state,
  });

  const steerSubmissionsRef = useRef(new Set<string>());
  const directSteerDraftRef = useRef<string | null>(null);
  useEffect(() => { directSteerDraftRef.current = null; }, [inputValue, referenceSignature, state.chatId, state.runId]);
  useEffect(() => {
    const active = new Set(Object.values(state.pendingSteers).flat().map(item => item.steerId));
    for (const id of steerSubmissionsRef.current) {
      if (!active.has(id)) steerSubmissionsRef.current.delete(id);
    }
  }, [state.pendingSteers]);
  const handleSteer = useCallback(async (steerId: string, prepared?: PendingSteer) => {
    if (isAgentExecutionBlocked(stateRef.current)) return;
    const currentState = stateRef.current;
    const chatId = String(currentState.chatId || "").trim();
    const steer = prepared ?? findPendingSteer(currentState.pendingSteers, { chatId, steerId })?.steer;
    if (!steer || steer.status !== "queued") return;

    if (steerSubmissionsRef.current.has(steerId)) return;
    const target = { chatId, runId: steer.runId, steerId };
    const owner = resolveCurrentOwner();
    if (!chatId || !steer.runId || !owner) {
      dispatch({ type: "RESTORE_PENDING_STEER", ...target });
      void messageApi.warning(t("composer.steer.unavailable"));
      return;
    }

    steerSubmissionsRef.current.add(steerId);
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

  const handleSend = useCallback((directSteer = false) => {
    directSteer = directSteer || Array.from(stateRef.current.timelineNodes.values()).some(node => node.runId === stateRef.current.runId && node.toolWait && node.status === "running" && !node.result);
    if (isAgentExecutionBlocked(stateRef.current)) return;
    // A BOT Chat queues messages, so only it may send while a question waits.
    if (isVoiceMode || (isAwaitingActive && !currentChatUsesMailboxSend(stateRef.current))) return;
    if (speechListening) {
      stopSpeechInput();
    }

    const selectedSlashItem = !directSteer && showSlashPalette ? selectSlashItem() : null;
    if (selectedSlashItem) {
      if (selectedSlashItem.kind === "command") {
        void executeSlashCommand(selectedSlashItem.id);
      } else {
        onSelectSlashSkill(selectedSlashItem);
      }
      return;
    }

    if (isEmbedMode() && inputValue.trim().startsWith("/")) { void messageApi.warning(t("embed.commandUnavailable")); return; }
    const message = isEmbedMode() ? withEmbedContext(inputValue.trim()) : inputValue.trim();
    if (!hasSendableQuery(message, sendReferences, hasQueryHistory(stateRef.current), canContinueChat(stateRef.current)) && !hasSendableContent(message, sendReferences, true)) return;
    if (hasUploadingAttachments || hasFailedAttachments) return;
    if (pendingSendRef.current && pendingSentMessageRef.current === message && pendingSentReferencesRef.current === referenceSignature) {
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
    const detailAction = parseDetailSlashInput(message);
    if (detailAction !== null) {
      if (detailAction === "unsupported" || !activeChatId || mainChatRunning
        || isSlashCommandDisabled("detail", executeSlashCommandInput.slashAvailability)) return;
      setInputValue("");
      setSlashDismissed(false);
      closeMention();
      showChatDetails();
      return;
    }
    const btwMessage = parseBTWSlashInput(message);
    if (btwMessage !== null) {
      if (btwMessage && referenceIds(sendReferences, "kbase").length > 0) { void messageApi.warning(t("kbase.btwUnsupported")); return; }
      if (btwMessage && referenceIds(sendReferences, "skill").length > 0) {
        void messageApi.warning(t("composer.addMenu.skill.btwUnsupported"));
        return;
      }
      void openBtwCommand(btwMessage);
      return;
    }
    const mainRuntime = resolveMainChatRuntime(
      currentState,
      activeQuerySessionRequestIdRef,
      querySessionsRef,
    );
    if (mainRuntime.running && (!currentChatUsesMailboxSend(currentState) || (!message && sendReferences.length === 0))) {
      const activeRunId = mainRuntime.runId || resolveCurrentRunId();
      if (!activeChatId || !activeRunId) {
        dispatch({
          type: "APPEND_DEBUG",
          line: `[send] recovered stale main chat runtime before submit (chatId=${activeChatId || "-"}, runId=${activeRunId || "-"})`,
        });
        dispatch({ type: "SET_STREAMING", streaming: false });
        dispatch({ type: "SET_ABORT_CONTROLLER", controller: null });
      } else {
        if (!hasSendableContent(message, sendReferences, true)) return;
        const directSignature = JSON.stringify([activeChatId, activeRunId, message, referenceSignature]);
        if (directSteer && directSteerDraftRef.current === directSignature) return;
        if (directSteer) directSteerDraftRef.current = directSignature;
        const steerId =
          typeof globalThis.crypto?.randomUUID === "function"
            ? globalThis.crypto.randomUUID()
            : createRequestId("steer");
        const steer: PendingSteer = {
          steerId, message, requestId: createRequestId("req"), runId: activeRunId,
          createdAt: Date.now(), status: "queued", references: structuredClone(sendReferences),
        };
        dispatch({ type: "ENQUEUE_PENDING_STEER", chatId: activeChatId, steer });
        if (directSteer) void handleSteer(steerId, steer);
        // The queue now owns these references; cancellation restores them through
        // the existing pending-steer reference state.
        notifySelectedTextReferencesAccepted(sendReferences);
        onRecordMessage?.(message);
        setInputValue("");
        dispatch({ type: "SET_COMPOSER_DRAFT", draft: "" });
        clearComposerAttachments();
        setSlashDismissed(false);
        closeMention();
        return;
      }
    }
    if (!hasSendableQuery(message, sendReferences, hasQueryHistory(currentState), canContinueChat(currentState))) return;
    pendingSendRef.current = true;
    pendingSentMessageRef.current = message;
    pendingSentReferencesRef.current = referenceSignature;
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
    if (referenceIds(sendReferences, "skill").length > 0) {
      const mention = parseLeadingAgentMention(
        message,
        resolveMentionCandidatesFromState(currentState),
      );
      const finalAgentKey =
        owner?.kind === "agent"
          ? mention.mentionAgentKey || owner.agentKey
          : "";
      if (
        !skillReferenceAgentKey ||
        finalAgentKey !== skillReferenceAgentKey
      ) {
        pendingSendRef.current = false;
        pendingSentMessageRef.current = "";
        void messageApi.warning(
          t("composer.addMenu.skill.routeMismatch"),
        );
        return;
      }
    }

    const submissionRequestId = createRequestId("req");
    onRecordMessage?.(message);
    setInputValue("");
    dispatch({ type: "SET_COMPOSER_DRAFT", draft: "" });
    clearComposerAttachments();
    setSlashDismissed(false);
    closeMention();
    dispatch({ type: "BEGIN_COMPOSER_SUBMISSION", draft: {
      requestId: submissionRequestId, chatId: stateRef.current.chatId,
      agentKey: owner?.kind === "agent" ? owner.agentKey : "", message,
      uploadChatId: !currentState.chatId ? attachmentChatId : undefined,
      schemaVersion: 2, references: [...sendReferences],
    } });
    window.dispatchEvent(
      new CustomEvent("agent:send-message", {
        detail: {
          message,
          submissionRequestId,
          chatId: pendingChatId || undefined,
          ...(owner?.kind === "agent" ? { agentKey: owner.agentKey } : {}),

          references: sendReferences,
          attachments: sendAttachmentMeta,
          accessLevel,
          model: modelOverride,
          params: controlParams,
          editingMode: editingModeAvailable ? currentState.editingMode ?? false : undefined,
          skillReferenceAgentKey,
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
    executeSlashCommandInput.slashAvailability,
    hasUploadingAttachments,
    hasFailedAttachments,
    inputValue,
    isAwaitingActive,
    isVoiceMode,
    modelOverride,
    skillReferenceAgentKey,
    messageApi,
    openCompactChooser,
    showChatDetails,
    openBtwCommand,
    activeQuerySessionRequestIdRef,
    querySessionsRef,
    resolveCurrentRunId,
    selectSlashItem,
    onSelectSlashSkill,
    sendAttachmentMeta,
    sendReferences,
    referenceSignature,
    setInputValue,
    setSlashDismissed,
    showSlashPalette,
    speechListening,
    state.chatAgentById,
    state.chatId,
    state.chats,
    state.currentChatActiveRun,
    state.editingMode,
    editingModeAvailable,
    handleSteer,
    state.pendingNewChatAgentKey,
    state.workerIndexByKey,
    state.workerSelectionKey,
    stateRef,
    stopSpeechInput,
    submitCompactCommand,
    t,
    onRecordMessage,
  ]);

  const handleSubmitQueuedSteer = useCallback(() => {
    if (isVoiceMode || (isAwaitingActive && !currentChatUsesMailboxSend(stateRef.current))) return;
    const currentState = stateRef.current;
    const runtime = resolveMainChatRuntime(currentState, activeQuerySessionRequestIdRef, querySessionsRef);
    if (!runtime.running) return;
    if (hasSendableContent(inputValue, sendReferences, true)) {
      handleSend(true);
      return;
    }
    const runId = runtime.runId || resolveCurrentRunId();
    const queued = currentState.pendingSteers[currentState.chatId]?.find(
      steer => steer.status === "queued" && steer.runId === runId,
    );
    if (queued) void handleSteer(queued.steerId);
  }, [isAwaitingActive, isVoiceMode, stateRef, activeQuerySessionRequestIdRef, querySessionsRef, resolveCurrentRunId, handleSteer, inputValue, sendReferences, handleSend]);

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
    handleSubmitQueuedSteer,
    interruptCurrentRun,
    pendingSentMessageRef,
    pendingSendRef,
    resetForNewConversation,
  };
}
