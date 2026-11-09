import sharedPresentation from "@/shared/ui/Presentation.module.css";
import { bindCssModuleClasses } from "@/shared/utils/cssModuleClasses";
import appPresentation from "@/app/layout/ShellPresentation.module.css";
import React from "react";
import { useDesktopHeaderLayout } from "./useDesktopHeaderLayout";
import { useConversationSurface } from "@/shared/ui/ConversationSurfaceContext";
import { ConversationRegionSkeleton } from "@/features/conversation/components/ConversationRegionSkeleton";
import {
  useOptionalAppContext,
  useAppState,
  useAppDispatch,
} from "@/app/state/AppContext";
import { selectConversationState, selectUiState } from "@/app/state/selectors";
import type { AppState } from "@/app/state/AppContext";
import type { RightSidebarTabKey } from "@/features/viewers/lib/viewerState";
import {
  resolveCurrentWorkerSummary,
  workerShowsTerminal,
  workerHasWorkspace,
} from "@/features/workers/lib/currentWorker";
import {
  isDebugPanelEnabled,
  isVoiceEnabled,
} from "@/shared/config/featureFlags";
import { formatPlatformErrorForDisplay } from "@/shared/data/errors/platformError";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { TimelineTextSearchControl } from "@/features/timeline/components/TimelineTextSearchControl";
import { Divider } from "antd";
import { UsageContextControl } from "@/features/usage/components/UsageContextControl";
import { useTerminalAgentStatuses } from "@/features/terminal/hooks/useActiveTerminalAgents";
import { resolveMainChatRuntime } from "@/features/runs/lib/runRuntimeState";
import { useOpenTarget } from "@/features/surfaces/hooks/useOpenTarget";
import { formatVoiceShortcut } from "@/features/voice/lib/voiceShortcut";
import { canStartVoiceChat } from "@/features/voice/lib/voiceState";
import { isDesktopAppMode } from "@/shared/utils/routing";
const presentationClasses = bindCssModuleClasses({ ...appPresentation, ...sharedPresentation });


export interface TopNavStatusDisplay {
  statusClass: "is-idle" | "is-running" | "is-error";
  statusText: string;
  statusDetail?: string;
}

const STATUS_PILL_BASE_CLASS =
  "tw:relative tw:inline-flex tw:flex-none tw:items-center tw:whitespace-nowrap tw:break-keep tw:font-code tw:font-semibold tw:tracking-[0.02em] tw:[writing-mode:horizontal-tb] tw:before:absolute tw:before:top-1/2 tw:before:rounded-full tw:before:content-[''] tw:before:-translate-y-1/2";

const STATUS_PILL_SIZE_CLASS_BY_DENSITY = {
  default:
    "tw:rounded-[10px] tw:py-1.5 tw:pl-6 tw:pr-[11px] tw:text-[11px] tw:leading-[1.25] tw:before:left-2.5 tw:before:h-2 tw:before:w-2",
  compact:
    "tw:rounded-lg tw:py-[5px] tw:pl-[22px] tw:pr-[9px] tw:text-[10px] tw:leading-[1.25] tw:before:left-[9px] tw:before:h-[7px] tw:before:w-[7px]",
} as const;

const STATUS_PILL_TONE_CLASS_BY_STATUS: Record<
  TopNavStatusDisplay["statusClass"],
  string
> = {
  "is-idle":
    "tw:text-ink-2 tw:before:bg-[color-mix(in_srgb,var(--ink-muted)_90%,white)]",
  "is-running":
    "tw:text-accent-electric-strong tw:before:animate-[flash_1s_infinite] tw:before:bg-accent-electric",
  "is-error":
    "tw:text-[color-mix(in_srgb,var(--accent-danger)_80%,#3e1120)] tw:before:bg-accent-danger",
};

export function resolveStatusPillClassName(
  statusClass: TopNavStatusDisplay["statusClass"],
  density: keyof typeof STATUS_PILL_SIZE_CLASS_BY_DENSITY = "default",
): string {
  return [
    "status-pill",
    statusClass,
    STATUS_PILL_BASE_CLASS,
    STATUS_PILL_SIZE_CLASS_BY_DENSITY[density],
    STATUS_PILL_TONE_CLASS_BY_STATUS[statusClass],
  ].join(" ");
}

const TOP_NAV_CLASS = presentationClasses("top-nav tw:col-[2/3] tw:row-start-1 tw:pr-1.5 tw:h-9 tw:py-0");
const TOP_NAV_INNER_CLASS =
  "top-nav-inner tw:flex tw:h-full tw:min-h-0 tw:w-full tw:items-center";
const NAV_GROUP_CLASS = "nav-group tw:relative tw:flex tw:items-center tw:empty:flex-[0_1_180px]";
const NAV_LEFT_CLASS = "nav-group nav-left tw:relative tw:h-8 tw:min-w-0 tw:flex-[0_1_180px]";
const NAV_CENTER_CLASS =
  "nav-group nav-center tw:flex-[1_1_auto] tw:flex tw:min-w-0 tw:items-center tw:justify-center tw:pr-[22px]";
const CURRENT_WORKER_CARD_CLASS =
  presentationClasses("current-worker-card tw:relative tw:flex tw:items-center tw:justify-center tw:gap-2.5 tw:max-[1279px]:min-w-0 tw:max-[1279px]:gap-2 tw:max-[1279px]:px-3 tw:max-[1279px]:py-0");
const CURRENT_WORKER_NAME_CLASS =
  "current-worker-name tw:min-w-0 tw:truncate tw:text-sm tw:font-semibold tw:leading-[1.2] tw:text-ink-1";
const TOP_NAV_ICON_BUTTON_SIZE_CLASS =
  "top-nav-icon-btn tw:h-6 tw:min-h-6 tw:w-6 tw:min-w-6 tw:rounded-lg tw:p-0";
const TOP_NAV_ICON_BUTTON_CLASS = `${TOP_NAV_ICON_BUTTON_SIZE_CLASS} ui-icon-hover-24`;
const CURRENT_WORKER_TOOL_BASE_CLASS =
  presentationClasses(`${TOP_NAV_ICON_BUTTON_CLASS} current-worker-tool`);
const VOICE_TOOL_CLASS_BY_MODE = {
  call: [
    CURRENT_WORKER_TOOL_BASE_CLASS,
    presentationClasses("current-worker-tool-voice is-call tw:text-[#2f7c49]"),
  ].join(" "),
  hangup: presentationClasses(
    `${TOP_NAV_ICON_BUTTON_SIZE_CLASS} current-worker-tool current-worker-tool-voice is-hangup`,
  ),
} as const;
const MUTED_TOOL_ACTIVE_CLASS =
  "is-muted tw:border tw:[border-color:color-mix(in_srgb,#ff945f_38%,var(--line-soft))] tw:bg-[color-mix(in_srgb,#fff0e6_84%,var(--bg-elev-2))] tw:text-[#cf5f18]";

export function resolveTopNavStatus(
  state: Pick<AppState, "events"> & Partial<Pick<AppState, "streaming">>,
  running = false,
): TopNavStatusDisplay {
  // 找到最近一次 run.start 的索引，只关心该 run 内的 run.error
  let lastRunStartIndex = -1;
  for (let index = state.events.length - 1; index >= 0; index -= 1) {
    if (state.events[index].type === "run.start") {
      lastRunStartIndex = index;
      break;
    }
  }

  let runErrorDetail = "";
  let hasRunError = false;
  for (
    let index = state.events.length - 1;
    index > lastRunStartIndex;
    index -= 1
  ) {
    const event = state.events[index];
    if (event.type === "run.error") {
      hasRunError = true;
      const rawError = (event as Record<string, unknown>).error;
      runErrorDetail = rawError
        ? formatPlatformErrorForDisplay(event).message
        : "";
      break;
    }
  }

  if (running) {
    return {
      statusClass: "is-running",
      statusText: "topNav.status.running",
    };
  }

  if (hasRunError) {
    return {
      statusClass: "is-error",
      statusText: "topNav.status.error",
      ...(runErrorDetail ? { statusDetail: runErrorDetail } : {}),
    };
  }

  return {
    statusClass: "is-idle",
    statusText: "topNav.status.idle",
  };
}

export const TopNav: React.FC<{ surface?: "root" | "agent" }> = ({
  surface = "root",
}) => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const appContext = useOptionalAppContext();
  const { t } = useI18n();
  const openTarget = useOpenTarget();
  const ui = selectUiState(state);
  const conversation = selectConversationState(state);
  const mainChatRuntime = appContext
    ? resolveMainChatRuntime(
        appContext.stateRef,
        appContext.activeQuerySessionRequestIdRef,
        appContext.querySessionsRef,
      )
    : null;
  const isMainChatRunning = Boolean(mainChatRuntime?.running);
  const { statusClass, statusText, statusDetail } = resolveTopNavStatus(
    state,
    isMainChatRunning,
  );
  const currentWorker = resolveCurrentWorkerSummary(state);
  const desktopMode = isDesktopAppMode();
  const desktopHeaderLayout = useDesktopHeaderLayout(desktopMode && surface === "agent");
  const showTerminalButton = !desktopMode && workerShowsTerminal(currentWorker);
  const terminalAgentStatuses = useTerminalAgentStatuses(showTerminalButton);
  const voiceEnabled = isVoiceEnabled() && state.voiceChat.capabilities?.enabled === true;
  const voiceModeAvailable = voiceEnabled && currentWorker?.type === "agent";
  const showMuteControl = voiceEnabled && (voiceModeAvailable || ui.audioMuted);
  const debugPanelEnabled = isDebugPanelEnabled();
  const hideDesktopAgentActions = desktopMode && surface === "agent";
  const showProjectButton = !desktopMode && workerHasWorkspace(currentWorker);
  const currentWorkerTerminalStatus = showTerminalButton
    ? terminalAgentStatuses.get(currentWorker?.sourceId || "")
    : undefined;
  const isCurrentWorkerTerminalActive = Boolean(currentWorkerTerminalStatus);
  const isCurrentWorkerTerminalBusy = currentWorkerTerminalStatus === "busy";
  const voiceOpenShortcutLabel = formatVoiceShortcut(state.voiceShortcut);
  const voiceOpenAriaShortcut = formatVoiceShortcut(state.voiceShortcut, true);
  const voiceToggleDisabled =
    !voiceModeAvailable ||
    (state.inputMode !== "voice" && !canStartVoiceChat(state.voiceChat, isMainChatRunning, Boolean(state.activeFrontendTool || state.activeAwaiting)));
  const handleToggleVoiceMode = () => {
    if (voiceToggleDisabled) return;
    if (state.inputMode !== "voice") window.dispatchEvent(new CustomEvent("agent:voice-start"));
    else dispatch({ type: "SET_INPUT_MODE", mode: "text" });
  };

  const handleToggleAudioMuted = () => {
    dispatch({
      type: "SET_AUDIO_MUTED",
      muted: !state.audioMuted,
    });
  };

  const toggleRightSidebar = (tab: RightSidebarTabKey) => {
    if (surface !== "root") {
      if (!state.chatId) return;
      openTarget({
        version: 1,
        kind: tab === "debug" ? "debug" : "overview",
        chatId: state.chatId,
        agentKey: currentWorker?.sourceId,
      });
      return;
    }
    if (state.rightSidebarOpen && tab === state.rightSidebarOpenTab) {
      dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
      return;
    }

    dispatch({
      type: "OPEN_RIGHT_SIDEBAR",
      tab,
    });
  };
  const debugButton = debugPanelEnabled ? (
    <UiButton
      className={TOP_NAV_ICON_BUTTON_CLASS}
      size="sm"
      variant="ghost"
      iconOnly
      aria-label={
        surface !== "root"
          ? t("copilot.panel.debug")
          : ui.rightSidebarOpen
            ? t("topNav.debug.close")
            : t("topNav.debug.open")
      }
      active={
        surface === "root" &&
        state.rightSidebarOpen &&
        state.rightSidebarOpenTab === "debug"
      }
      onClick={() => toggleRightSidebar("debug")}
    >
      <MaterialIcon name="bug_report" />
    </UiButton>
  ) : null;

  const statusLabel = t(statusText);
  const presentation = useConversationSurface();
  const statusTitle = statusDetail
    ? `${statusLabel}: ${statusDetail}`
    : statusLabel;
  return (
    <nav className={TOP_NAV_CLASS}
      data-desktop-sidebar-collapsed={desktopHeaderLayout.sidebarCollapsed ? "true" : undefined}
      style={desktopHeaderLayout.headerLeftInset ? { paddingLeft: desktopHeaderLayout.headerLeftInset } : undefined}>
      <div className={TOP_NAV_INNER_CLASS}>
        <div className={NAV_LEFT_CLASS}>
          {state.chatId && <TimelineTextSearchControl appearance="input" />}
        </div>

        <div className={NAV_CENTER_CLASS}>
          {presentation?.blocked ? <ConversationRegionSkeleton region="header" phase={presentation.phase} /> :
          <div className={CURRENT_WORKER_CARD_CLASS} aria-live="polite">
            <strong className={CURRENT_WORKER_NAME_CLASS}>
              {currentWorker?.displayName || t("topNav.noSelection")}
            </strong>
            <span
              className={resolveStatusPillClassName(statusClass)}
              id="api-status"
              title={statusTitle}
              aria-label={statusTitle}
            >
              {statusLabel}
            </span>
            <UsageContextControl />
          </div>
          }
        </div>

        {hideDesktopAgentActions ? (
          <div className={NAV_GROUP_CLASS}>
            {debugButton}
          </div>
        ) : (
          <div className={NAV_GROUP_CLASS}>
            {showProjectButton ? (
              <UiButton
                className={TOP_NAV_ICON_BUTTON_CLASS}
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={t("topNav.project.open")}
                title={t("topNav.project.open")}
                onClick={() =>
                  openTarget({
                    version: 1,
                    kind: "project",
                    agentKey: currentWorker?.sourceId,
                    chatId: state.chatId || undefined,
                  })
                }
              >
                <MaterialIcon name="folder_open" />
              </UiButton>
            ) : null}
            {voiceModeAvailable ? (
              <UiButton
                className={
                  conversation.inputMode === "voice"
                    ? VOICE_TOOL_CLASS_BY_MODE.hangup
                    : VOICE_TOOL_CLASS_BY_MODE.call
                }
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
                    ? undefined
                    : voiceOpenAriaShortcut || undefined
                }
                title={
                  conversation.inputMode === "voice"
                    ? t("topNav.voice.hangup")
                    : voiceOpenShortcutLabel ? t("topNav.voice.openWithShortcut", {
                        shortcut: voiceOpenShortcutLabel,
                      }) : t("topNav.voice.open")
                }
                onClick={handleToggleVoiceMode}
              >
                <MaterialIcon
                  name={
                    conversation.inputMode === "voice" ? "call_end" : "call"
                  }
                />
              </UiButton>
            ) : null}
            {showMuteControl ? (
              <UiButton
                className={[
                  CURRENT_WORKER_TOOL_BASE_CLASS,
                  ui.audioMuted ? MUTED_TOOL_ACTIVE_CLASS : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
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
                <MaterialIcon
                  name={ui.audioMuted ? "volume_off" : "volume_up"}
                />
              </UiButton>
            ) : null}
            <Divider type="vertical" />
            {debugButton}
            {showTerminalButton ? (
              <UiButton
                className={[
                  TOP_NAV_ICON_BUTTON_CLASS,
                  "current-worker-tool-terminal tw:relative",
                  isCurrentWorkerTerminalActive ? "has-terminal" : "",
                  isCurrentWorkerTerminalBusy ? "has-running-terminal" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                variant="ghost"
                size="sm"
                iconOnly
                active={surface === "root" && ui.terminalDockOpen}
                aria-label={
                  surface === "root" && ui.terminalDockOpen
                    ? t("topNav.terminal.close")
                    : t("topNav.terminal.open")
                }
                title={
                  surface === "root" && ui.terminalDockOpen
                    ? t("topNav.terminal.close")
                    : t("topNav.terminal.open")
                }
                onClick={() =>
                  surface === "root"
                    ? dispatch({
                        type: "SET_TERMINAL_DOCK_OPEN",
                        open: !ui.terminalDockOpen,
                      })
                    : currentWorker
                      ? openTarget({
                          version: 1,
                          kind: "terminal",
                          agentKey: currentWorker.sourceId,
                          terminalKey: "main",
                        })
                      : undefined
                }
              >
                <MaterialIcon name="terminal" />
                {isCurrentWorkerTerminalActive ? (
                  <span
                    className={[
                      presentationClasses("current-worker-terminal-dot tw:absolute tw:right-[5px] tw:top-[5px] tw:h-[7px] tw:w-[7px] tw:rounded-full tw:border tw:border-bg-elev-1 tw:bg-accent-electric-strong"),
                      isCurrentWorkerTerminalBusy
                        ? "is-busy tw:animate-[status-pulse_1s_ease-in-out_infinite] tw:bg-accent-lime tw:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-lime)_16%,transparent)]"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-hidden
                  />
                ) : null}
              </UiButton>
            ) : null}
            <UiButton
              className={TOP_NAV_ICON_BUTTON_CLASS}
              size="sm"
              variant="ghost"
              iconOnly
              aria-label={t("copilot.panel.overview")}
              title={t("copilot.panel.overview")}
              active={
                surface === "root" &&
                state.rightSidebarOpen &&
                state.rightSidebarOpenTab !== "debug"
              }
              onClick={() => toggleRightSidebar("overview")}
            >
              <MaterialIcon
                name={surface === "root" ? "dock_to_right" : "open_in_new"}
                className="tw:text-[16px]"
                style={surface === "root" ? { transform: "scaleX(-1)" } : undefined}
              />
            </UiButton>
          </div>
        )}
      </div>
    </nav>
  );
};
