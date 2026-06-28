import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { App as AntdApp } from "antd";
import {
  useAppContext,
  useAppDispatch,
  useAppState,
} from "@/app/state/AppContext";
import { Buildin } from "@/features/tools/components/buildin";
import { AwaitingHtmlContainer } from "@/features/tools/components/AwaitingHtmlContainer";
import { AwaitingShell } from "@/features/composer/components/AwaitingShell";
import { MentionSuggest } from "@/features/composer/components/MentionSuggest";
import { SlashPalette } from "@/features/composer/components/SlashPalette";
import { SteerBar } from "@/features/composer/components/SteerBar";
import {
  ComposerProvider,
  type ComposerContextValue,
} from "@/features/composer/components/ComposerContext";
import { ComposerAttachments } from "@/features/composer/components/ComposerAttachments";
import { ComposerInput } from "@/features/composer/components/ComposerInput";
import { ComposerActions } from "@/features/composer/components/ComposerActions";
import { ComposerWonders } from "@/features/composer/components/ComposerWonders";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { getLatestQueryText } from "@/features/composer/lib/slashCommands";
import { buildTimelineDisplayItems } from "@/features/timeline/lib/timelineDisplay";
import { useSpeechInput } from "@/features/composer/components/useSpeechInput";
import { useActiveRunIdentity } from "@/features/composer/hooks/useActiveRunIdentity";
import { useComposerAttachments } from "@/features/composer/hooks/useComposerAttachments";
import { useComposerAwaiting } from "@/features/composer/hooks/useComposerAwaiting";
import { useComposerKeyboard } from "@/features/composer/hooks/useComposerKeyboard";
import { useComposerLifecycle } from "@/features/composer/hooks/useComposerLifecycle";
import { useComposerMention } from "@/features/composer/hooks/useComposerMention";
import { useRuntimeAccessLevel } from "@/features/composer/hooks/useRuntimeAccessLevel";
import { useComposerSend } from "@/features/composer/hooks/useComposerSend";
import { useComposerSlash } from "@/features/composer/hooks/useComposerSlash";
import { useComposerWonders } from "@/features/composer/hooks/useComposerWonders";
import { isVoiceEnabled } from "@/shared/config/featureFlags";
import type {
  QueryAccessLevel,
  QueryModelOverride,
} from "@/shared/data";
import { useI18n } from "@/shared/i18n";

interface ComposerAreaProps {
  emptyInputMinRows?: number;
  inputMaxRows?: number;
  showWonders?: boolean;
}

export const ComposerArea: React.FC<ComposerAreaProps> = ({
  emptyInputMinRows = 5,
  inputMaxRows = 10,
  showWonders = true,
}) => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { stateRef } = useAppContext();
  const { t } = useI18n();
  const { message } = AntdApp.useApp();
  const composerRef = useRef<HTMLDivElement>(null);
  const composerPillRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<TextAreaRef>(null);
  const isComposingRef = useRef(false);
  const [inputValue, setInputValue] = useState("");
  const [controlParams, setControlParams] = useState<Record<string, unknown>>(
    {},
  );
  const [accessLevel, setAccessLevel] = useState<QueryAccessLevel>("default");
  const [modelOverride, setModelOverride] = useState<QueryModelOverride>({});
  const isRestoringDraftRef = useRef(false);

  // Restore: 当 state.composerDraft 被 reducer 更改（SET_CHAT_ID 恢复草稿）时，同步到 inputValue
  useEffect(() => {
    if (state.composerDraft !== inputValue) {
      isRestoringDraftRef.current = true;
      setInputValue(state.composerDraft);
    }
  }, [state.composerDraft]);

  useEffect(() => {
    if (state.composerDraft === inputValue) {
      return;
    }
    if (isRestoringDraftRef.current) {
      isRestoringDraftRef.current = false;
      return; // 这是 restore 触发的，不写回 reducer
    }
    dispatch({ type: "SET_COMPOSER_DRAFT", draft: inputValue });
  }, [dispatch, inputValue, state.composerDraft]);

  const isFrontendActive = !!state.activeFrontendTool;
  const voiceEnabled = isVoiceEnabled();
  const isVoiceMode = voiceEnabled && state.inputMode === "voice";
  const currentWorker = useMemo(
    () => resolveCurrentWorkerSummary(state),
    [state],
  );
  const currentAgentKey = useMemo(() => {
    if (currentWorker?.type !== "agent") {
      return "";
    }
    return String(currentWorker.sourceId || "").trim();
  }, [currentWorker]);
  const { activeRunId, activeRunAgentKey } = useActiveRunIdentity(state);
  const voiceModeAvailable = voiceEnabled && currentWorker?.type === "agent";
  const planningModeAvailable =
    currentWorker?.type === "agent" &&
    String(currentWorker.raw?.mode || "")
      .trim()
      .toUpperCase() === "CODER";

  useEffect(() => {
    if (state.planningMode && !planningModeAvailable) {
      dispatch({
        type: "SET_PLANNING_MODE",
        chatId: state.chatId,
        enabled: false,
        persist: false,
      });
    }
  }, [dispatch, planningModeAvailable, state.planningMode, state.chatId]);
  const timelineEntries = useMemo(() => {
    return state.timelineOrder
      .map((id) => state.timelineNodes.get(id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
  }, [state.timelineNodes, state.timelineOrder]);
  const latestQueryText = useMemo(
    () => getLatestQueryText(timelineEntries),
    [timelineEntries],
  );
  const isTimelineEmpty = useMemo(() => {
    return (
      buildTimelineDisplayItems(
        timelineEntries,
        state.events,
        state.taskItemsById,
      ).length === 0
    );
  }, [state.events, state.taskItemsById, timelineEntries]);
  const isBlankConversation =
    isTimelineEmpty && !String(state.chatId || "").trim();

  useEffect(() => {
    if (!voiceEnabled && state.inputMode === "voice") {
      dispatch({ type: "SET_INPUT_MODE", mode: "text" });
    }
  }, [dispatch, state.inputMode, voiceEnabled]);

  const {
    clearActiveAwaiting,
    handleAwaitingSubmit,
    handlePatchActiveAwaiting,
    isAwaitingActive,
  } = useComposerAwaiting({
    activeAwaiting: state.activeAwaiting,
    dispatch,
    state,
  });

  const {
    attachmentChatId,
    attachmentScrollState,
    attachmentViewportRef,
    attachments,
    canCaptureDesktopScreenshot,
    captureDesktopScreenshot,
    clearComposerAttachments,
    fileInputRef,
    handleFileDragOver,
    handleFileDrop,
    handleFileSelection,
    handleFilePaste,
    handleRemoveAttachment,
    hasComposerAttachmentOverflow,
    hasUploadingAttachments,
    isCapturingDesktopScreenshot,
    openFilePicker,
    scrollComposerAttachments,
    sendAttachmentMeta,
    sendReferences,
    useUnifiedComposerAttachmentRow,
  } = useComposerAttachments({
    dispatch,
    isFrontendActive,
    isVoiceMode,
    onError: (text) => {
      void message.error(text || t("composer.actions.screenshotFailed"));
    },
    state,
  });

  const {
    activeSlashIndex,
    selectSlashCommand,
    setActiveSlashIndex,
    setSlashDismissed,
    showSlashPalette,
    slashCommands,
    slashDismissed,
    slashPaletteRef,
    slashPopoverWidth,
  } = useComposerSlash({
    commandModalOpen: state.commandModal.open,
    composerPillRef,
    composerRef,
    inputValue,
    isAwaitingActive,
    isFrontendActive,
    isVoiceMode,
    canUsePlanningMode: planningModeAvailable,
  });

  const { closeMention, selectMentionByIndex, updateMentionSuggestions } =
    useComposerMention({
      dispatch,
      setInputValue,
      setSlashDismissed,
      state,
      textareaRef,
    });

  const toggleVoiceMode = useCallback(() => {
    if (!voiceModeAvailable || state.streaming || isFrontendActive) {
      return;
    }
    dispatch({
      type: "SET_INPUT_MODE",
      mode: isVoiceMode ? "text" : "voice",
    });
  }, [
    dispatch,
    isFrontendActive,
    isVoiceMode,
    state.streaming,
    voiceModeAvailable,
  ]);

  const togglePlanningMode = useCallback(() => {
    if (!planningModeAvailable) {
      if (state.planningMode) {
        dispatch({
          type: "SET_PLANNING_MODE",
          chatId: state.chatId,
          enabled: false,
          persist: false,
        });
      }
      return;
    }
    dispatch({
      type: "SET_PLANNING_MODE",
      chatId: state.chatId,
      enabled: !state.planningMode,
      persist: true,
    });
  }, [dispatch, planningModeAvailable, state.planningMode, state.chatId]);

  const {
    speechSupported,
    speechListening,
    speechState,
    speechStatus,
    toggleSpeechInput,
    stopSpeechInput,
  } = useSpeechInput({
    inputValue,
    setInputValue,
    setSlashDismissed,
    updateMentionSuggestions,
  });

  function resolveHasCompactUsage(events: typeof state.events): boolean {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i] as Record<string, unknown>;
      if (event.type !== "context.compact.complete") continue;
      return Boolean(event.compactionUsage);
    }
    return false;
  }

  const slashAvailability = useMemo(
    () => ({
      streaming: state.streaming,
      hasLatestQuery: Boolean(latestQueryText),
      isFrontendActive,
      canUsePlanningMode: planningModeAvailable,
      canUseVoiceMode: Boolean(voiceModeAvailable),
      hasActiveChat: Boolean(String(state.chatId || "").trim()),
      hasCurrentWorker: Boolean(currentWorker),
      workerHistoryCount: currentWorker?.relatedChats.length || 0,
      workerCount: state.workerRows.length,
      commandModalOpen: state.commandModal.open,
      canShowUsage:
        Boolean(state.usageSnapshot) ||
        state.streaming ||
        resolveHasCompactUsage(state.events),
    }),
    [
      currentWorker,
      isFrontendActive,
      latestQueryText,
      state.chatId,
      state.commandModal.open,
      state.streaming,
      state.usageSnapshot,
      state.events,
      state.workerRows.length,
      voiceModeAvailable,
      planningModeAvailable,
    ],
  );

  const {
    applyComposerDraft,
    executeSlashCommand,
    handleCancelSteer,
    handleSend,
    handleSteer,
    interruptCurrentRun,
    steerSubmitting,
  } = useComposerSend({
    attachmentChatId,
    accessLevel,
    backgroundCommandText: {
      rememberPending: t("composer.background.remember.pending"),
      rememberError: t("composer.background.remember.error"),
      learnPending: t("composer.background.learn.pending"),
      learnError: t("composer.background.learn.error"),
      compactPending: t("composer.background.compact.pending"),
      compactError: t("composer.background.compact.error"),
    },
    clearComposerAttachments,
    closeMention,
    controlParams,
    dispatch,
    executeSlashCommandInput: {
      closeMention,
      latestQueryText,
      setInputValue,
      setSlashDismissed,
      slashAvailability,
      state: {
        rightSidebarOpen: state.rightSidebarOpen,
        planningMode: state.planningMode,
        chatId: state.chatId,
        usagePopoverOpen: state.usagePopoverOpen,
      },
      toggleVoiceMode,
    },
    hasUploadingAttachments,
    inputValue,
    isAwaitingActive,
    isVoiceMode,
    modelOverride,
    selectSlashCommand,
    sendAttachmentMeta,
    sendReferences,
    setInputValue,
    setSlashDismissed,
    showSlashPalette,
    speechListening,
    state,
    stateRef,
    stopSpeechInput,
    textareaRef,
    updateMentionSuggestions,
  });

  const handleAccessLevelChange = useRuntimeAccessLevel({
    accessLevel,
    activeRunId,
    activeRunAgentKey,
    isRunActive: state.streaming || isAwaitingActive,
    setAccessLevel,
    messageApi: message,
    t,
  });

  const {
    currentAgentWonders,
    reshuffleWonders,
    sampledGreeting,
    sampledWonders,
  } = useComposerWonders({
    agents: state.agents,
    currentAgentKey,
    isBlankConversation,
    showWonders,
  });

  const hasPendingSteers =
    (state.pendingSteers[String(state.chatId || "")] || []).length > 0;
  const shouldShowSteerBar =
    !isFrontendActive &&
    !isAwaitingActive &&
    hasPendingSteers;
  const showSpeechHint =
    voiceEnabled &&
    !isVoiceMode &&
    (!speechSupported ||
      speechState === "error" ||
      speechState === "unsupported");
  const sendDisabled =
    isFrontendActive ||
    isAwaitingActive ||
    hasUploadingAttachments ||
    !inputValue.trim();

  const handleKeyDown = useComposerKeyboard({
    closeMention,
    dispatch,
    executeSlashCommand,
    handleSend,
    onTogglePlanningMode: togglePlanningMode,
    canUsePlanningMode: planningModeAvailable,
    isComposingRef,
    isVoiceMode,
    mentionActiveIndex: state.mentionActiveIndex,
    mentionOpen: state.mentionOpen,
    mentionSuggestionsLength: state.mentionSuggestions.length,
    selectMentionByIndex,
    selectSlashCommand,
    setActiveSlashIndex,
    setSlashDismissed,
    showSlashPalette,
    slashCommandsLength: slashCommands.length,
  });

  useComposerLifecycle({
    applyComposerDraft,
    chatId: state.chatId,
    closeMention,
    isFrontendActive,
    isVoiceMode,
    setInputValue,
    setSlashDismissed,
    stopSpeechInput,
    textareaRef,
  });

  const composerContextValue = useMemo<ComposerContextValue>(
    () => ({
      inputValue,
      setInputValue,
      activeSlashIndex,
      setActiveSlashIndex,
      slashDismissed,
      setSlashDismissed,
      attachmentScrollState,
      captureDesktopScreenshot,
      openFilePicker,
      handleSend,
      interruptCurrentRun,
      executeSlashCommand: async (commandId) => {
        await executeSlashCommand(commandId);
      },
      toggleSpeechInput,
      applyComposerDraft,
    }),
    [
      activeSlashIndex,
      applyComposerDraft,
      attachmentScrollState,
      captureDesktopScreenshot,
      executeSlashCommand,
      handleSend,
      inputValue,
      interruptCurrentRun,
      openFilePicker,
      setActiveSlashIndex,
      setSlashDismissed,
      slashDismissed,
      toggleSpeechInput,
    ],
  );

  if (isAwaitingActive && state.activeAwaiting) {
    if (state.activeAwaiting.mode === "form") {
      return (
        <AwaitingShell>
          <AwaitingHtmlContainer
            data={state.activeAwaiting}
            onPatch={handlePatchActiveAwaiting}
            onSubmit={handleAwaitingSubmit}
            onClose={clearActiveAwaiting}
            onResolved={clearActiveAwaiting}
          />
        </AwaitingShell>
      );
    }
    if (state.activeAwaiting.mode === "approval") {
      return (
        <AwaitingShell>
          <Buildin.ApprovalDialog
            data={state.activeAwaiting}
            onSubmit={handleAwaitingSubmit}
            onResolved={clearActiveAwaiting}
          />
        </AwaitingShell>
      );
    }
    if (state.activeAwaiting.mode === "plan") {
      return (
        <AwaitingShell>
          <Buildin.PlanDialog
            data={state.activeAwaiting}
            onSubmit={handleAwaitingSubmit}
            onResolved={clearActiveAwaiting}
          />
        </AwaitingShell>
      );
    }
    if (state.activeAwaiting.mode === "question") {
      return (
        <AwaitingShell>
          <Buildin.QuestionDialog
            data={state.activeAwaiting}
            onSubmit={handleAwaitingSubmit}
            onResolved={clearActiveAwaiting}
          />
        </AwaitingShell>
      );
    }
    return null;
  }

  return (
    <ComposerProvider value={composerContextValue}>
      <div
        ref={composerRef}
        className={`composer-area ${isFrontendActive ? "is-frontend-active" : ""}`}
      >
        <input
          ref={fileInputRef}
          className="composer-file-input"
          type="file"
          multiple
          tabIndex={-1}
          hidden
          onChange={handleFileSelection}
        />
        {state.mentionOpen && <MentionSuggest />}
        {shouldShowSteerBar && (
          <SteerBar
            pendingSteers={
              state.pendingSteers[String(state.chatId || "")] || []
            }
            steerSubmitting={steerSubmitting}
            onSubmit={(steerId) => void handleSteer(steerId)}
            onCancel={handleCancelSteer}
          />
        )}
        <div
          className={`composer-layout ${isFrontendActive ? "is-frontend-active" : ""}`}
        >
          <SlashPalette
            open={showSlashPalette}
            slashPaletteRef={slashPaletteRef}
            slashCommands={slashCommands}
            activeSlashIndex={activeSlashIndex}
            slashAvailability={slashAvailability}
            planningMode={state.planningMode}
            slashPopoverWidth={slashPopoverWidth}
            getPopupContainer={() => composerRef.current ?? document.body}
            onSelect={(commandId) => void executeSlashCommand(commandId)}
          >
            <div className="composer-stack">
              <div
                ref={composerPillRef}
                className={`composer-pill ${isFrontendActive ? "hidden" : ""} ${isVoiceMode ? "is-voice-mode" : ""}`}
              >
                <ComposerAttachments
                  attachments={attachments}
                  attachmentViewportRef={attachmentViewportRef}
                  useUnifiedComposerAttachmentRow={
                    useUnifiedComposerAttachmentRow
                  }
                  hasComposerAttachmentOverflow={hasComposerAttachmentOverflow}
                  attachmentScrollState={attachmentScrollState}
                  onRemoveAttachment={handleRemoveAttachment}
                  onScroll={scrollComposerAttachments}
                />
                <ComposerInput
                  isVoiceMode={isVoiceMode}
                  isFrontendActive={isFrontendActive}
                  isTimelineEmpty={isTimelineEmpty}
                  inputValue={inputValue}
                  placeholder={sampledGreeting}
                  currentWorkerName={
                    state.voiceChat.currentAgentName ||
                    currentWorker?.displayName ||
                    ""
                  }
                  voiceStatus={state.voiceChat.status}
                  voiceError={state.voiceChat.error}
                  partialUserText={state.voiceChat.partialUserText}
                  partialAssistantText={state.voiceChat.partialAssistantText}
                  emptyInputMinRows={emptyInputMinRows}
                  inputMaxRows={inputMaxRows}
                  onInputChange={(next) => {
                    setInputValue(next);
                    setSlashDismissed(false);
                    if (slashCommands.length > 0 || next.startsWith("/")) {
                      closeMention();
                    }
                    if (!next.startsWith("/")) {
                      updateMentionSuggestions(next);
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  onPaste={handleFilePaste}
                  onDragOver={handleFileDragOver}
                  onDrop={handleFileDrop}
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    isComposingRef.current = false;
                  }}
                  textareaRef={textareaRef}
                />
                <ComposerActions
                  accessLevel={accessLevel}
                  isFrontendActive={isFrontendActive}
                  isVoiceMode={isVoiceMode}
                  isStreaming={state.streaming}
                  canCaptureDesktopScreenshot={canCaptureDesktopScreenshot}
                  isCapturingDesktopScreenshot={isCapturingDesktopScreenshot}
                  modelOverride={modelOverride}
                  planningMode={state.planningMode}
                  canUsePlanningMode={planningModeAvailable}
                  voiceEnabled={voiceEnabled}
                  hasUploadingAttachments={hasUploadingAttachments}
                  speechListening={speechListening}
                  speechSupported={speechSupported}
                  speechStatus={speechStatus}
                  sendDisabled={sendDisabled}
                  onAccessLevelChange={handleAccessLevelChange}
                  onControlParamsChange={setControlParams}
                  onModelOverrideChange={setModelOverride}
                  onTogglePlanningMode={togglePlanningMode}
                />
                {showSpeechHint && (
                  <div className="voice-hint">{speechStatus}</div>
                )}
              </div>
              {showWonders &&
                isBlankConversation &&
                sampledWonders.length > 0 && (
                  <ComposerWonders
                    sampledWonders={sampledWonders}
                    allWonders={currentAgentWonders}
                    onReshuffle={reshuffleWonders}
                  />
                )}
            </div>
          </SlashPalette>
        </div>
      </div>
    </ComposerProvider>
  );
};
