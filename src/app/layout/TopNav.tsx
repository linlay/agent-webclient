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
import { hasAgentProjectWorkspace, selectCurrentAgent } from "@/features/agents/lib/agentState";
import type { AppState } from "@/app/state/AppContext";
import type { RightSidebarTabKey } from "@/features/viewers/lib/viewerState";
import {
  resolveCurrentWorkerSummary,
  workerShowsTerminal,
} from "@/features/workers/lib/currentWorker";
import {
  isDebugPanelEnabled,
  isVoiceEnabled,
} from "@/shared/config/featureFlags";
import { formatPlatformErrorForDisplay } from "@/shared/data/errors/platformError";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon, type MaterialIconName } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { TimelineTextSearchControl } from "@/features/timeline/components/TimelineTextSearchControl";
import { useTimelineTextSearch } from "@/features/timeline/components/TimelineTextSearchProvider";
import { Divider, Popover } from "antd";
import { useSettingsOverlayState } from "@/features/settings/components/SettingsOverlayProvider";
import { useMemoryOverlayState } from "@/features/memory/components/MemoryOverlayProvider";
import { useCommandOverlayOpen } from "@/features/command-center/components/CommandOverlayProvider";
import { UsageContextControl } from "@/features/usage/components/UsageContextControl";
import {
  hasUsageControlContent,
  resolveLatestCompactUsage,
} from "@/features/usage/lib/usageMetrics";
import { useGlobalSearchOpen } from "@/features/search/components/GlobalSearchOverlayProvider";
import { useTerminalAgentStatuses } from "@/features/terminal/hooks/useActiveTerminalAgents";
import { resolveMainChatRuntime } from "@/features/runs/lib/runRuntimeState";
import { useOpenTarget } from "@/features/surfaces/hooks/useOpenTarget";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { buildClientLayoutHref } from "@/shared/utils/mobileRoutes";
import { supportsPrimaryChat } from "@/features/chats/lib/primaryChatIntent";
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

interface MobileMenuRowProps {
  icon: MaterialIconName;
  label: string;
  onSelect: () => void;
  active?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  ariaExpanded?: boolean;
  iconStyle?: React.CSSProperties;
}

/**
 * 手机端更多操作菜单的单行条目：图标加文案，行间用细分隔线分开。
 * 菜单卡片、行高与命中区域由 `MobileLayout.module.css` 的 `.mobile-topbar-menu*` 定义。
 */
const MobileMenuRow: React.FC<MobileMenuRowProps> = ({
  icon,
  label,
  onSelect,
  active = false,
  disabled = false,
  ariaLabel,
  ariaExpanded,
  iconStyle,
}) => (
  <button
    type="button"
    className="mobile-topbar-menu-row"
    aria-label={ariaLabel || label}
    aria-expanded={ariaExpanded}
    data-active={active ? "true" : undefined}
    disabled={disabled}
    onClick={onSelect}
  >
    <MaterialIcon name={icon} className="mobile-topbar-menu-icon" style={iconStyle} />
    <span className="mobile-topbar-menu-label">{label}</span>
  </button>
);

export const TopNav: React.FC<{ surface?: "root" | "agent"; mobile?: boolean; onOpenNavigation?: () => void }> = ({
  surface = "root", mobile = false, onOpenNavigation,
}) => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const appContext = useOptionalAppContext();
  const { t } = useI18n();
  const openTarget = useOpenTarget();
  const [toolsOpen, setToolsOpen] = React.useState(false);
  const { isAnyOverlayOpen } = useSettingsOverlayState();
  const { isMemoryOpen } = useMemoryOverlayState();
  const isCommandOverlayOpen = useCommandOverlayOpen();
  const isGlobalSearchOpen = useGlobalSearchOpen();
  const ui = selectUiState(state);
  const conversation = selectConversationState(state);
  const presentation = useConversationSurface();
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
  const showTerminalButton = workerShowsTerminal(currentWorker);
  const terminalAgentStatuses = useTerminalAgentStatuses(showTerminalButton);
  const voiceEnabled = isVoiceEnabled() && state.voiceChat.capabilities?.enabled === true;
  const voiceModeAvailable = voiceEnabled && currentWorker?.type === "agent";
  const showMuteControl = voiceEnabled && (voiceModeAvailable || ui.audioMuted);
  const debugPanelEnabled = isDebugPanelEnabled();
  const hideDesktopAgentActions = desktopMode && surface === "agent";
  const projectAgent = selectCurrentAgent(state, currentWorker?.sourceId || "");
  const agentAvailability = projectAgent && state.agentAvailability[projectAgent.key];
  const showProjectButton = !desktopMode && !presentation?.blocked &&
    (!agentAvailability || agentAvailability === "available") && hasAgentProjectWorkspace(projectAgent);
  const currentWorkerTerminalStatus = showTerminalButton
    ? terminalAgentStatuses.get(currentWorker?.sourceId || "")
    : undefined;
  const isCurrentWorkerTerminalActive = Boolean(currentWorkerTerminalStatus);
  const isCurrentWorkerTerminalBusy = currentWorkerTerminalStatus === "busy";
  // 手机端把顶栏操作收进“更多”菜单，行内条目与桌面图标按钮共用同一套可用性判断。
  const textSearch = useTimelineTextSearch();
  const canSearchTimeline = Boolean(textSearch && textSearch.searchableNodeIds.size > 0);
  // 搜索不再嵌在菜单卡片里：点击菜单行后菜单收起，搜索条铺满并盖在顶栏上，不压住正文。
  const mobileSearchOpen = Boolean(mobile && canSearchTimeline && textSearch?.open);
  // 「开始新对话」是已有对话里的另起一个入口：当前没有对话时不展示。
  const showNewConversationAction = Boolean(
    state.chatId &&
      currentWorker?.raw &&
      !supportsPrimaryChat(String(currentWorker.raw.mode || "")),
  );
  // 手机端左侧位置与导航按钮互斥：有可展示的用量时让位给用量入口。
  const compactUsage = React.useMemo(
    () => resolveLatestCompactUsage(state.events),
    [state.events],
  );
  const showMobileUsageControl = Boolean(
    mobile &&
      hasUsageControlContent({
        usageSnapshot: state.usageSnapshot,
        compactUsage,
        running: isMainChatRunning,
      }),
  );
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
    !voiceModeAvailable ||
    (state.inputMode !== "voice" && (isMainChatRunning || Boolean(state.activeFrontendTool)));
  const handleToggleVoiceMode = () => {
    if (voiceToggleDisabled) return;
    if (state.inputMode !== "voice") window.dispatchEvent(new CustomEvent("agent:voice-start"));
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
    window.dispatchEvent(new CustomEvent("agent:voice-start"));
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
    if (isAnyOverlayOpen || isMemoryOpen || isCommandOverlayOpen || isGlobalSearchOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(mobile ? ".modal, .ant-modal, .ant-drawer" : ".modal, .ant-modal")
      ) {
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
    isAnyOverlayOpen,
    isMemoryOpen,
    isCommandOverlayOpen,
    isGlobalSearchOpen,
    isMacPlatform,
    mobile,
  ]);

  // 浮层不再随菜单关闭，切换对话时由顶栏收起，避免把上一条对话的关键词带到新对话。
  const searchChatIdRef = React.useRef(state.chatId);
  React.useEffect(() => {
    if (!mobile || searchChatIdRef.current === state.chatId) return;
    searchChatIdRef.current = state.chatId;
    textSearch?.closeSearch();
  }, [mobile, state.chatId, textSearch]);

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
  const handleOpenProject = () => openTarget({
    version: 1,
    kind: "project",
    agentKey: currentWorker?.sourceId,
    chatId: state.chatId || undefined,
  });
  const handleToggleTerminal = () => {
    if (surface === "root") {
      dispatch({ type: "SET_TERMINAL_DOCK_OPEN", open: !ui.terminalDockOpen });
      return;
    }
    if (!currentWorker) return;
    openTarget({
      version: 1,
      kind: "terminal",
      agentKey: currentWorker.sourceId,
      terminalKey: "main",
    });
  };
  const handleOpenMobileSidebar = () => {
    if (state.rightSidebarOpen) dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
    else toggleRightSidebar("overview");
  };
  const handleStartNewConversation = () => {
    window.dispatchEvent(new CustomEvent("agent:start-new-conversation", {
      detail: {
        ...(currentWorker ? { agentKey: currentWorker.sourceId } : {}),
        preserveWorkerContext: true,
        focusComposerOnComplete: false,
      },
    }));
  };
  const handleOpenDesktopView = () => {
    window.location.assign(buildClientLayoutHref("/", window.location.search, state.chatId));
  };
  const handleMobileMenuOpenChange = (open: boolean) => {
    if (open) {
      // 菜单与搜索浮层不同时占据顶栏：打开菜单先收起浮层。
      textSearch?.closeSearch();
      setToolsOpen(true);
      return;
    }
    setToolsOpen(false);
  };
  const handleMobileMenuClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    // 菜单行点击后收起菜单；搜索行收起菜单后由浮层接手输入。
    if (!target.closest("button")) return;
    setToolsOpen(false);
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
  const statusTitle = statusDetail
    ? `${statusLabel}: ${statusDetail}`
    : statusLabel;
  const sidebarButton = (
    <UiButton
      className={TOP_NAV_ICON_BUTTON_CLASS}
      size="sm"
      variant="ghost"
      iconOnly
      aria-label={t("copilot.panel.overview")}
      title={t("copilot.panel.overview")}
      active={surface === "root" && state.rightSidebarOpen && state.rightSidebarOpenTab !== "debug"}
      onClick={() => toggleRightSidebar("overview")}
    >
      <MaterialIcon name={surface === "root" ? "dock_to_right" : "open_in_new"}
        className="tw:text-[16px]" style={surface === "root" ? { transform: "scaleX(-1)" } : undefined} />
    </UiButton>
  );
  const tools = hideDesktopAgentActions ? (
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
                onClick={handleOpenProject}
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
                onClick={handleToggleTerminal}
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
            {sidebarButton}
          </div>
        );
  const mobileDebugPanelActive =
    state.rightSidebarOpen && state.rightSidebarOpenTab === "debug";
  const mobileTerminalDockActive = surface === "root" && ui.terminalDockOpen;
  const mobileMenu = (
    <div className="mobile-topbar-menu" onClick={handleMobileMenuClick}>
      {canSearchTimeline ? (
        <MobileMenuRow
          icon="search"
          label={t("timeline.textSearch.open")}
          onSelect={() => textSearch?.openSearch()}
        />
      ) : null}
      <MobileMenuRow
        icon={surface === "root" ? "dock_to_right" : "open_in_new"}
        iconStyle={surface === "root" ? { transform: "scaleX(-1)" } : undefined}
        label={t(state.rightSidebarOpen ? "mobile.closeContent" : "mobile.openContent")}
        ariaExpanded={state.rightSidebarOpen}
        active={state.rightSidebarOpen}
        onSelect={handleOpenMobileSidebar}
      />
      {showProjectButton ? (
        <MobileMenuRow icon="folder_open" label={t("topNav.project.open")}
          onSelect={handleOpenProject} />
      ) : null}
      {showTerminalButton ? (
        <MobileMenuRow icon="terminal"
          label={t(mobileTerminalDockActive ? "topNav.terminal.close" : "topNav.terminal.open")}
          active={mobileTerminalDockActive} onSelect={handleToggleTerminal} />
      ) : null}
      {voiceModeAvailable ? (
        <MobileMenuRow
          icon={conversation.inputMode === "voice" ? "call_end" : "call"}
          label={t(conversation.inputMode === "voice" ? "topNav.voice.hangup" : "topNav.voice.open")}
          active={conversation.inputMode === "voice"}
          disabled={voiceToggleDisabled}
          onSelect={handleToggleVoiceMode}
        />
      ) : null}
      {showMuteControl ? (
        <MobileMenuRow
          icon={ui.audioMuted ? "volume_off" : "volume_up"}
          label={t(ui.audioMuted ? "topNav.audio.unmute" : "topNav.audio.mute")}
          active={ui.audioMuted}
          onSelect={handleToggleAudioMuted}
        />
      ) : null}
      {debugPanelEnabled ? (
        <MobileMenuRow icon="bug_report"
          label={t(mobileDebugPanelActive ? "topNav.debug.close" : "topNav.debug.open")}
          active={mobileDebugPanelActive} onSelect={() => toggleRightSidebar("debug")} />
      ) : null}
      <MobileMenuRow icon="open_in_new" label={t("mobile.desktop")}
        onSelect={handleOpenDesktopView} />
    </div>
  );
  return (
    // 搜索浮层铺满顶栏时，顶栏内容整条让位（见 MobileLayout.module.css）：
    // 它既不该从搜索条后面透出来，也不该再被点击或读出。
    <nav className={TOP_NAV_CLASS}
      data-desktop-sidebar-collapsed={desktopHeaderLayout.sidebarCollapsed ? "true" : undefined}
      data-mobile-search-open={mobileSearchOpen ? "true" : undefined}
      style={desktopHeaderLayout.headerLeftInset ? { paddingLeft: desktopHeaderLayout.headerLeftInset } : undefined}>
      <div className={TOP_NAV_INNER_CLASS}>
        <div className={NAV_LEFT_CLASS}>
          {mobile ? (showMobileUsageControl ? (
            <UsageContextControl presentation="mobile" />
          ) : (
            <UiButton className="mobile-header-action" variant="ghost" size="sm" iconOnly aria-label={t("mobile.openNavigation")} onClick={onOpenNavigation}>
              <MaterialIcon name="dock_to_right" />
            </UiButton>
          )) : state.chatId && <TimelineTextSearchControl appearance="input" />}
        </div>

        <div className={NAV_CENTER_CLASS}>
          {presentation?.blocked ? <ConversationRegionSkeleton region="header" phase={presentation.phase} /> :
          <div className={CURRENT_WORKER_CARD_CLASS} aria-live="polite">
            <strong className={CURRENT_WORKER_NAME_CLASS}>
              {currentWorker?.displayName || t("topNav.noSelection")}
            </strong>
            {mobile ? (
              // 手机端顶栏只保留状态圆点，状态文字仍在 title/aria-label 中保留。
              <span
                className={`mobile-status-dot ${statusClass}`}
                id="api-status"
                role="img"
                title={statusTitle}
                aria-label={statusTitle}
              />
            ) : (
              <span
                className={resolveStatusPillClassName(statusClass)}
                id="api-status"
                title={statusTitle}
                aria-label={statusTitle}
              >
                {statusLabel}
              </span>
            )}
            {mobile ? null : <UsageContextControl />}
          </div>
          }
        </div>

        {mobile ? (
          <div className="mobile-topbar-actions">
            {showNewConversationAction ? (
              <UiButton className="mobile-header-action" variant="ghost" size="sm" iconOnly
                aria-label={t("topNav.newConversation")} title={t("topNav.newConversation")}
                onClick={handleStartNewConversation}>
                <MaterialIcon name="edit_square" />
              </UiButton>
            ) : null}
            <Popover open={toolsOpen} onOpenChange={handleMobileMenuOpenChange} trigger="click"
              placement="bottomRight" arrow={false}
              classNames={{ root: "mobile-topbar-menu-popover" }} content={mobileMenu}>
              <UiButton className="mobile-header-action" variant="ghost" size="sm" iconOnly
                aria-label={t("leftSidebar.moreActions")} aria-expanded={toolsOpen}>
                <MaterialIcon name="more_horiz" />
              </UiButton>
            </Popover>
          </div>
        ) : tools}
      </div>
      {mobile && mobileSearchOpen ? (
        // 搜索浮层是顶栏的兄弟节点：绝对定位在顶栏盒子内，整宽盖住顶栏，
        // 底边止于顶栏下沿，`.conversation-stage` 不被遮挡。
        <div
          className="mobile-topbar-search"
          role="search"
          aria-label={t("timeline.textSearch.open")}
        >
          <TimelineTextSearchControl />
        </div>
      ) : null}
    </nav>
  );
};
