import React, { useMemo } from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { CommandStatusOverlay } from "@/app/layout/CommandStatusOverlay";
import { resolveTopNavStatus } from "@/app/layout/TopNav";
import { useAppRuntimes } from "@/app/layout/hooks/useAppRuntimes";
import { AttachmentPreviewPanel } from "@/app/layout/sidebar/right/AttachmentPreviewPanel";
import { DebugTab } from "@/app/layout/sidebar/right/DebugTab";
import { OverviewTab } from "@/app/layout/sidebar/right/OverviewTab";
import { ActionModal } from "@/app/modals/ActionModal";
import { ArchiveModal } from "@/features/settings/components/ArchiveModal";
import { CommandModal } from "@/app/modals/CommandModal";
import { EventPopover } from "@/app/modals/EventPopover";
import { MemoryInfoModal } from "@/features/settings/components/MemoryInfoModal";
import { SettingsModal } from "@/features/settings/components/SettingsModal";
import { BottomDock } from "@/app/layout/BottomDock";
import { FireworksCanvas } from "@/app/effects/FireworksCanvas";
import { selectConversationState, selectUiState } from "@/app/state/selectors";
import { ConversationStage } from "@/features/timeline/components/ConversationStage";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { isDebugPanelEnabled } from "@/shared/config/featureFlags";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

const CopilotTopBar: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const ui = selectUiState(state);
  const conversation = selectConversationState(state);
  const currentWorker = resolveCurrentWorkerSummary(state);
  const { statusClass, statusText } = resolveTopNavStatus(state);
  const voiceModeAvailable = currentWorker?.type === "agent";
  const voiceToggleDisabled =
    !voiceModeAvailable || state.streaming || Boolean(state.activeFrontendTool);
  const showMuteControl = voiceModeAvailable || ui.audioMuted;
  const isMacPlatform = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/.test(navigator.platform),
    [],
  );
  const voiceOpenShortcutLabel = isMacPlatform ? "⌘⇧Space" : "Ctrl+Shift+Space";

  const handleStartNewConversation = () => {
    window.dispatchEvent(new CustomEvent("agent:start-new-conversation"));
  };

  const handleToggleVoiceMode = () => {
    if (voiceToggleDisabled) return;
    dispatch({
      type: "SET_INPUT_MODE",
      mode: state.inputMode === "voice" ? "text" : "voice",
    });
  };

  const handleToggleAudioMuted = () => {
    dispatch({
      type: "SET_AUDIO_MUTED",
      muted: !state.audioMuted,
    });
  };

  return (
    <header className="copilot-topbar">
      <div className="copilot-title-block">
        <strong className="copilot-worker-name">
          {currentWorker?.displayName || t("topNav.noSelection")}
        </strong>
        <span className={`status-pill ${statusClass}`} id="copilot-api-status">
          {t(statusText)}
        </span>
      </div>
      <div className="copilot-topbar-actions">
        <UiButton
          className="copilot-action-btn"
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t("topNav.newConversation")}
          title={t("topNav.newConversation")}
          onClick={handleStartNewConversation}
        >
          <MaterialIcon name="edit_square" />
        </UiButton>
        <UiButton
          className="copilot-action-btn"
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t("commandModal.switch.title")}
          title={t("commandModal.switch.title")}
          onClick={() =>
            dispatch({
              type: "OPEN_COMMAND_MODAL",
              modal: { type: "switch" },
            })
          }
        >
          <MaterialIcon name="swap_horiz" />
        </UiButton>
        <UiButton
          className="copilot-action-btn"
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t("commandModal.history.title")}
          title={t("commandModal.history.title")}
          onClick={() =>
            dispatch({
              type: "OPEN_COMMAND_MODAL",
              modal: { type: "history" },
            })
          }
        >
          <MaterialIcon name="history" />
        </UiButton>
        {voiceModeAvailable ? (
          <UiButton
            className={`copilot-action-btn current-worker-tool-voice ${conversation.inputMode === "voice" ? "is-hangup" : "is-call"}`}
            variant="ghost"
            size="sm"
            iconOnly
            disabled={voiceToggleDisabled}
            aria-label={
              conversation.inputMode === "voice"
                ? t("topNav.voice.hangup")
                : t("topNav.voice.open")
            }
            title={
              conversation.inputMode === "voice"
                ? t("topNav.voice.hangupWithShortcut")
                : t("topNav.voice.openWithShortcut", {
                    shortcut: voiceOpenShortcutLabel,
                  })
            }
            onClick={handleToggleVoiceMode}
          >
            <MaterialIcon
              name={conversation.inputMode === "voice" ? "call_end" : "call"}
            />
          </UiButton>
        ) : null}
        {showMuteControl ? (
          <UiButton
            className={`copilot-action-btn ${ui.audioMuted ? "is-muted" : ""}`}
            variant="ghost"
            size="sm"
            iconOnly
            active={ui.audioMuted}
            aria-label={
              ui.audioMuted ? t("topNav.audio.unmute") : t("topNav.audio.mute")
            }
            title={
              ui.audioMuted ? t("topNav.audio.unmute") : t("topNav.audio.mute")
            }
            onClick={handleToggleAudioMuted}
          >
            <MaterialIcon name={ui.audioMuted ? "volume_off" : "volume_up"} />
          </UiButton>
        ) : null}
        <UiButton
          className="copilot-action-btn"
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t("settings.title")}
          title={t("settings.title")}
          onClick={() => dispatch({ type: "SET_SETTINGS_OPEN", open: true })}
        >
          <MaterialIcon name="settings" />
        </UiButton>
      </div>
    </header>
  );
};

const CopilotSidePanel: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const debugPanelEnabled = isDebugPanelEnabled();
  const activeTab = state.rightSidebarOpenTab;

  if (!state.rightSidebarOpen || !activeTab) {
    return null;
  }

  if (activeTab === "debug" && !debugPanelEnabled) {
    return null;
  }

  const title =
    activeTab === "debug"
      ? t("copilot.panel.debug")
      : activeTab === "preview"
        ? t("copilot.panel.preview")
        : t("copilot.panel.overview");

  return (
    <section className="copilot-side-panel" aria-label={title}>
      <div className="copilot-side-panel-head">
        <strong>{title}</strong>
        <UiButton
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t("copilot.panel.close")}
          title={t("copilot.panel.close")}
          onClick={() => dispatch({ type: "CLOSE_RIGHT_SIDEBAR" })}
        >
          <MaterialIcon name="close" />
        </UiButton>
      </div>
      <div className="copilot-side-panel-body">
        {activeTab === "debug" ? (
          <DebugTab />
        ) : activeTab === "preview" && state.attachmentPreview ? (
          <AttachmentPreviewPanel />
        ) : (
          <OverviewTab />
        )}
      </div>
    </section>
  );
};

export const CopilotShell: React.FC = () => {
  const state = useAppState();

  useAppRuntimes();

  return (
    <div className="app-shell layout-copilot" id="app">
      <CopilotTopBar />
      <ConversationStage />
      <BottomDock />
      <CopilotSidePanel />
      <CommandStatusOverlay />
      {state.archiveOpen ? <ArchiveModal /> : null}
      {state.memoryInfoOpen ? <MemoryInfoModal /> : null}
      {state.settingsOpen && <SettingsModal />}
      <CommandModal />
      <ActionModal />
      <EventPopover />
      <FireworksCanvas />
    </div>
  );
};
