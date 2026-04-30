import React from "react";
import { useAppState, useAppDispatch } from "@/app/state/AppContext";
import { selectConversationState, selectUiState } from "@/app/state/selectors";
import type { AppState } from "@/app/state/types";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { Divider } from "antd";

interface TopNavStatusDisplay {
  statusClass: "is-idle" | "is-running" | "is-error";
  statusText: string;
}

export function resolveTopNavStatus(
  state: Pick<AppState, "streaming" | "events">,
): TopNavStatusDisplay {
  const hasRunError = state.events.some((event) => event.type === "run.error");

  if (state.streaming) {
    return {
      statusClass: "is-running",
      statusText: "topNav.status.running",
    };
  }

  if (hasRunError) {
    return {
      statusClass: "is-error",
      statusText: "topNav.status.error",
    };
  }

  return {
    statusClass: "is-idle",
    statusText: "topNav.status.idle",
  };
}

export const TopNav: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const ui = selectUiState(state);
  const conversation = selectConversationState(state);
  const { statusClass, statusText } = resolveTopNavStatus(state);
  const currentWorker = resolveCurrentWorkerSummary(state);
  const voiceModeAvailable = currentWorker?.type === "agent";
  const showMuteControl = voiceModeAvailable || ui.audioMuted;
  const isMacPlatform = React.useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/.test(navigator.platform),
    [],
  );
  const voiceOpenShortcutLabel = isMacPlatform ? "⌘⇧Space" : "Ctrl+Shift+Space";
  const voiceOpenAriaShortcut = isMacPlatform
    ? "Meta+Shift+Space"
    : "Control+Shift+Space";
  const voiceToggleDisabled =
    !voiceModeAvailable || state.streaming || Boolean(state.activeFrontendTool);

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

  const handleStartVoiceMode = React.useCallback(() => {
    if (voiceToggleDisabled || conversation.inputMode === "voice") return;
    dispatch({
      type: "SET_INPUT_MODE",
      mode: "voice",
    });
  }, [conversation.inputMode, dispatch, voiceToggleDisabled]);

  const handleHangupVoiceMode = React.useCallback(() => {
    if (conversation.inputMode !== "voice") return;
    dispatch({
      type: "SET_INPUT_MODE",
      mode: "text",
    });
  }, [conversation.inputMode, dispatch]);

  React.useEffect(() => {
    if (state.settingsOpen || state.commandModal.open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest(".modal")) {
        return;
      }

      const isVoiceOpenShortcut =
        event.code === "Space" &&
        event.shiftKey &&
        !event.altKey &&
        (isMacPlatform
          ? event.metaKey && !event.ctrlKey
          : event.ctrlKey && !event.metaKey);

      if (isVoiceOpenShortcut) {
        event.preventDefault();
        handleStartVoiceMode();
        return;
      }

      if (event.key !== "Escape") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      handleHangupVoiceMode();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    handleStartVoiceMode,
    handleHangupVoiceMode,
    isMacPlatform,
    state.commandModal.open,
    state.settingsOpen,
  ]);

  return (
    <nav className="top-nav">
      <div className="top-nav-inner">
        <div className="nav-group nav-left">
          <div className="brand-cluster">
            <div className="brand-mark">
              <UiButton
                id="open-left-drawer-btn"
                className="icon-btn"
                size="sm"
                iconOnly
                aria-label={t("topNav.openDrawer")}
                variant="primary"
                onClick={() =>
                  dispatch({
                    type: "SET_LEFT_DRAWER_OPEN",
                    open: !state.leftDrawerOpen,
                  })
                }
              >
                <MaterialIcon
                  name="dock_to_right"
                  className="brand-logo-icon"
                />
                <span className="brand-logo-text">Z</span>
              </UiButton>
              <div className="brand-text">
                <strong>AGENT</strong>
                <span>Webclient</span>
              </div>
            </div>
          </div>
          <UiButton
            id="top-nav-new-chat-btn"
            className="icon-btn top-nav-new-chat-btn"
            size="sm"
            aria-label={t("topNav.newConversation")}
            title={t("topNav.newConversation")}
            variant="ghost"
            iconOnly
            onClick={handleStartNewConversation}
          >
            <MaterialIcon name="edit_square" />
          </UiButton>
        </div>

        <div className="nav-group nav-center">
          <div className={`current-worker-card`} aria-live="polite">
            <strong className="current-worker-name">
              {currentWorker?.displayName || t("topNav.noSelection")}
            </strong>
            <span className={`status-pill ${statusClass}`} id="api-status">
              {t(statusText)}
            </span>
          </div>
        </div>

        <div className="nav-group">
          {voiceModeAvailable ? (
            <UiButton
              className={`current-worker-tool current-worker-tool-voice ${conversation.inputMode === "voice" ? "is-hangup" : "is-call"}`}
              variant="ghost"
              size="sm"
              iconOnly
              disabled={voiceToggleDisabled}
              aria-label={
                conversation.inputMode === "voice"
                  ? t("topNav.voice.hangup")
                  : t("topNav.voice.open")
              }
              aria-keyshortcuts={
                conversation.inputMode === "voice"
                  ? "Escape"
                  : voiceOpenAriaShortcut
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
              className={`current-worker-tool ${ui.audioMuted ? "is-muted" : ""}`}
              variant="ghost"
              size="sm"
              iconOnly
              active={ui.audioMuted}
              aria-label={
                ui.audioMuted
                  ? t("topNav.audio.unmute")
                  : t("topNav.audio.mute")
              }
              title={
                ui.audioMuted
                  ? t("topNav.audio.unmute")
                  : t("topNav.audio.mute")
              }
              onClick={handleToggleAudioMuted}
            >
              <MaterialIcon name={ui.audioMuted ? "volume_off" : "volume_up"} />
            </UiButton>
          ) : null}
          <Divider type="vertical" />
          <UiButton
            id="open-right-drawer-btn"
            className={`icon-btn ${state.desktopDebugSidebarEnabled ? "is-active" : ""}`}
            size="sm"
            variant="ghost"
            iconOnly
            active={state.desktopDebugSidebarEnabled}
            aria-label={
              ui.desktopDebugSidebarEnabled
                ? t("topNav.debug.close")
                : t("topNav.debug.open")
            }
            onClick={() => {
              if (state.attachmentPreview) {
                dispatch({ type: "CLOSE_ATTACHMENT_PREVIEW" });
                dispatch({
                  type: "SET_DESKTOP_DEBUG_SIDEBAR_ENABLED",
                  enabled: true,
                });
                return;
              }

              dispatch({
                type: "SET_DESKTOP_DEBUG_SIDEBAR_ENABLED",
                enabled: !state.desktopDebugSidebarEnabled,
              });
            }}
          >
            <MaterialIcon name="bug_report" />
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            iconOnly
            active={ui.terminalDockOpen}
            aria-label={
              ui.terminalDockOpen
                ? t("topNav.terminal.close")
                : t("topNav.terminal.open")
            }
            title={
              ui.terminalDockOpen
                ? t("topNav.terminal.close")
                : t("topNav.terminal.open")
            }
            onClick={() =>
              dispatch({
                type: "SET_TERMINAL_DOCK_OPEN",
                open: !ui.terminalDockOpen,
              })
            }
          >
            <MaterialIcon name="terminal" />
          </UiButton>
        </div>
      </div>
    </nav>
  );
};
