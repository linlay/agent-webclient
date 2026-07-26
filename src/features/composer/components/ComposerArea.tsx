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
import {
  buildCurrentWorkerDetailView,
  isDedicatedKbaseWorker,
  resolveCurrentWorkerSummary,
} from "@/features/workers/lib/currentWorker";
import type { ComposerRequiredSkill } from "@/features/composer/lib/composerAttachments";
import { getLatestQueryText } from "@/features/composer/lib/slashCommands";
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
import { useCommandOverlayOpen } from "@/features/workers/components/CommandOverlayProvider";
import { useGlobalSearchOpen } from "@/features/search/components/GlobalSearchOverlayProvider";
import { isVoiceEnabled } from "@/shared/config/featureFlags";
import type { QueryAccessLevel, QueryModelOverride } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { resolveMainChatRuntime } from "@/features/runs/lib/runRuntimeState";

interface ComposerAreaProps {
  emptyInputMinRows?: number;
  inputMaxRows?: number;
  showWonders?: boolean;
}

const COMPOSER_AREA_CLASS = "composer-area tw:relative tw:h-full";
const COMPOSER_AREA_FRONTEND_CLASS = "is-frontend-active";
const COMPOSER_LAYOUT_CLASS =
  "composer-layout tw:flex tw:items-stretch tw:gap-3.5 tw:h-full";
const COMPOSER_STACK_CLASS =
  "composer-stack tw:flex tw:min-w-0 tw:flex-1 tw:flex-col";
const COMPOSER_PILL_CLASS =
  "composer-pill tw:[--composer-main-min-height:84px] tw:relative tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:items-start tw:rounded-xl tw:border tw:border-border tw:p-1.5 tw:backdrop-blur-[10px] tw:duration-[220ms] tw:ease-in-out tw:[&_textarea]:flex-1 tw:[&_textarea]:resize-none tw:[&_textarea]:rounded-none tw:[&_textarea]:border-0 tw:[&_textarea]:bg-transparent tw:[&_textarea]:p-1.5 tw:[&_textarea]:text-[13px] tw:[&_textarea]:leading-[1.45] tw:[&_textarea]:outline-none tw:mb-[16px]";
const COMPOSER_PILL_FRONTEND_CLASS = "tw:hidden";
const COMPOSER_PILL_VOICE_CLASS =
  "tw:!border-[color-mix(in_srgb,var(--accent-electric)_16%,var(--line-soft))] tw:!bg-[radial-gradient(circle_at_0%_0%,rgba(94,165,255,0.1),transparent_32%),radial-gradient(circle_at_100%_100%,rgba(13,191,143,0.08),transparent_36%),color-mix(in_srgb,var(--bg-elev-2)_97%,transparent)] tw:!py-1.5 tw:!pr-1.5 tw:!pl-3";
const VOICE_HINT_CLASS =
  "voice-hint tw:mt-1 tw:px-2 tw:py-0 tw:text-[10px] tw:text-ink-muted";

export const ComposerArea: React.FC<ComposerAreaProps> = ({
  emptyInputMinRows = 5,
  inputMaxRows = 10,
  showWonders = true,
}) => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isCommandOverlayOpen = useCommandOverlayOpen();
  const isGlobalSearchOpen = useGlobalSearchOpen();
  const isAnyOverlayOpen = isCommandOverlayOpen || isGlobalSearchOpen;
  const {
    stateRef,
    querySessionsRef,
    activeQuerySessionRequestIdRef,
  } = useAppContext();
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
  const currentSkillKeys = useMemo(
    () =>
      currentWorker?.type === "agent"
        ? buildCurrentWorkerDetailView(currentWorker, t).skills
        : [],
    [currentWorker, t],
  );
  const [selectedSkill, setSelectedSkill] =
    useState<ComposerRequiredSkill | null>(null);
  useEffect(() => {
    setSelectedSkill(null);
  }, [currentWorker?.key]);
  const currentAgentKey = useMemo(() => {
    if (currentWorker?.type !== "agent") {
      return "";
    }
    return String(currentWorker.sourceId || "").trim();
  }, [currentWorker]);
  const { activeRunId, activeRunOwner } = useActiveRunIdentity(state);
  const voiceModeAvailable = voiceEnabled && currentWorker?.type === "agent";
  const mainChatRuntime = resolveMainChatRuntime(
    stateRef,
    activeQuerySessionRequestIdRef,
    querySessionsRef,
  );
  const isMainChatRunning = mainChatRuntime.running;
  const planningModeAvailable =
    currentWorker?.type === "agent" &&
    String(currentWorker.raw?.mode || "")
      .trim()
      .toUpperCase() === "CODER";
  const editingModeAvailable = isDedicatedKbaseWorker(currentWorker);

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
  useEffect(() => {
    if (state.editingMode && !editingModeAvailable) {
      dispatch({ type: "SET_EDITING_MODE", enabled: false });
    }
  }, [dispatch, editingModeAvailable, state.editingMode]);
  const timelineEntries = useMemo(() => {
    return state.timelineOrder
      .map((id) => state.timelineNodes.get(id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
  }, [state.timelineNodes, state.timelineOrder]);
  const latestQueryText = useMemo(
    () => getLatestQueryText(timelineEntries),
    [timelineEntries],
  );
  const isTimelineEmpty = useMemo(() => !state.chatId, [state.chatId]);
  const isBlankConversation = isTimelineEmpty;

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
    addContextReference,
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
    mainChatRunning: isMainChatRunning,
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
    commandOverlayOpen: isAnyOverlayOpen,
    composerPillRef,
    composerRef,
    inputValue,
    isAwaitingActive,
    isFrontendActive,
    isVoiceMode,
    canUsePlanningMode: planningModeAvailable,
    canUseEditingMode: editingModeAvailable,
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
    if (!voiceModeAvailable || isMainChatRunning || isFrontendActive) {
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
    isMainChatRunning,
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
  const handleEditingModeChange = useCallback(
    (enabled: boolean) => {
      dispatch({
        type: "SET_EDITING_MODE",
        enabled: editingModeAvailable && enabled === true,
      });
    },
    [dispatch, editingModeAvailable],
  );

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
      streaming: isMainChatRunning,
      hasLatestQuery: Boolean(latestQueryText),
      isFrontendActive,
      canUsePlanningMode: planningModeAvailable,
      canUseEditingMode: editingModeAvailable,
      canUseVoiceMode: Boolean(voiceModeAvailable),
      hasActiveChat: Boolean(String(state.chatId || "").trim()),
      hasCurrentWorker: Boolean(currentWorker),
      workerHistoryCount: currentWorker?.relatedChats.length || 0,
      workerCount: state.workerRows.length,
      commandOverlayOpen: isAnyOverlayOpen,
      canShowUsage:
        Boolean(state.usageSnapshot) ||
        isMainChatRunning ||
        resolveHasCompactUsage(state.events),
    }),
    [
      currentWorker,
      isFrontendActive,
      latestQueryText,
      state.chatId,
      isMainChatRunning,
      state.usageSnapshot,
      state.events,
      state.workerRows.length,
      isAnyOverlayOpen,
      voiceModeAvailable,
      planningModeAvailable,
      editingModeAvailable,
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
    clearRequiredSkill: () => setSelectedSkill(null),
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
        editingMode: state.editingMode,
        chatId: state.chatId,
        usagePopoverOpen: state.usagePopoverOpen,
      },
      toggleVoiceMode,
    },
    hasUploadingAttachments,
    inputValue,
    isAwaitingActive,
    isVoiceMode,
    mainChatRunning: isMainChatRunning,
    modelOverride,
    requiredSkillAgentKey: selectedSkill ? currentAgentKey : "",
    requiredSkillKeys: selectedSkill ? [selectedSkill.key] : [],
    selectSlashCommand,
    sendAttachmentMeta,
    sendReferences,
    setInputValue,
    setSlashDismissed,
    showSlashPalette,
    speechListening,
    state,
    stateRef,
    querySessionsRef,
    activeQuerySessionRequestIdRef,
    stopSpeechInput,
    textareaRef,
    updateMentionSuggestions,
  });

  const isCurrentChatActiveRun =
    Boolean(state.currentChatActiveRun?.runId) &&
    state.currentChatActiveRun?.chatId === state.chatId;

  const handleAccessLevelChange = useRuntimeAccessLevel({
    accessLevel,
    activeRunId,
    activeRunOwner,
    isRunActive: isMainChatRunning || isAwaitingActive || isCurrentChatActiveRun,
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
    !isFrontendActive && !isAwaitingActive && hasPendingSteers;
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
        className={`${COMPOSER_AREA_CLASS} ${isFrontendActive ? COMPOSER_AREA_FRONTEND_CLASS : ""}`}
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
            mainChatRunning={isMainChatRunning}
            onSubmit={(steerId) => void handleSteer(steerId)}
            onCancel={handleCancelSteer}
          />
        )}
        <div
          className={`${COMPOSER_LAYOUT_CLASS} ${isFrontendActive ? COMPOSER_AREA_FRONTEND_CLASS : ""}`}
        >
          <SlashPalette
            open={showSlashPalette}
            slashPaletteRef={slashPaletteRef}
            slashCommands={slashCommands}
            activeSlashIndex={activeSlashIndex}
            slashAvailability={slashAvailability}
            planningMode={state.planningMode}
            editingMode={state.editingMode}
            slashPopoverWidth={slashPopoverWidth}
            getPopupContainer={() => document.body}
            onSelect={(commandId) => void executeSlashCommand(commandId)}
          >
            <div className={COMPOSER_STACK_CLASS}>
              <div
                ref={composerPillRef}
                className={`${COMPOSER_PILL_CLASS} ${isFrontendActive ? COMPOSER_PILL_FRONTEND_CLASS : ""} ${isVoiceMode ? COMPOSER_PILL_VOICE_CLASS : ""}`}
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
                  isStreaming={isMainChatRunning}
                  canCaptureDesktopScreenshot={canCaptureDesktopScreenshot}
                  isCapturingDesktopScreenshot={isCapturingDesktopScreenshot}
                  modelOverride={modelOverride}
                  planningMode={state.planningMode}
                  canUsePlanningMode={planningModeAvailable}
                  editingMode={state.editingMode}
                  canUseEditingMode={editingModeAvailable}
                  currentChatId={state.chatId}
                  currentSkillKeys={currentSkillKeys}
                  selectedSkill={selectedSkill}
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
                  onEditingModeChange={handleEditingModeChange}
                  onAddReference={addContextReference}
                  onSelectedSkillChange={setSelectedSkill}
                />
                {showSpeechHint && (
                  <div className={VOICE_HINT_CLASS}>{speechStatus}</div>
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
