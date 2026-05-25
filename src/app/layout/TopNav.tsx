import React from "react";
import { useAppState, useAppDispatch } from "@/app/state/AppContext";
import { selectConversationState, selectUiState } from "@/app/state/selectors";
import type {
  AIUsageSnapshotEvent,
  AIUsageStats,
  AppState,
  RightSidebarTabKey,
} from "@/app/state/types";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { isDebugPanelEnabled, isVoiceEnabled } from "@/shared/config/featureFlags";
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

function readUsageNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function formatUsageNumber(value: unknown): string {
  const numberValue = readUsageNumber(value);
  return numberValue == null ? "-" : numberValue.toLocaleString();
}

function formatCompactUsageNumber(value: unknown): string {
  const numberValue = readUsageNumber(value);
  if (numberValue == null) return "-";
  if (numberValue >= 1_000_000) return `${(numberValue / 1_000_000).toFixed(1)}M`;
  if (numberValue >= 1_000) return `${(numberValue / 1_000).toFixed(1)}K`;
  return numberValue.toLocaleString();
}

function resolveDisplayTotal(snapshot: AIUsageSnapshotEvent | null): number | null {
  if (!snapshot?.usage) return null;
  return (
    readUsageNumber(snapshot.usage.run?.totalTokens)
    ?? readUsageNumber(snapshot.usage.current?.totalTokens)
    ?? readUsageNumber(snapshot.usage.chat?.totalTokens)
  );
}

export function resolveNextUsagePopoverOpen(isOpen: boolean): boolean {
  return !isOpen;
}

function getReasoningTokens(stats?: AIUsageStats): unknown {
  return stats?.completionTokensDetails?.reasoningTokens;
}

function getCachedTokens(stats?: AIUsageStats): unknown {
  return stats?.promptTokensDetails?.cachedTokens;
}

interface UsageMetric {
  key: string;
  label: string;
  value: unknown;
}

function buildUsageMetrics(t: (key: string) => string, stats?: AIUsageStats): UsageMetric[] {
  return [
    { key: "prompt", label: t("topNav.usage.metric.prompt"), value: stats?.promptTokens },
    {
      key: "completion",
      label: t("topNav.usage.metric.completion"),
      value: stats?.completionTokens,
    },
    { key: "total", label: t("topNav.usage.metric.total"), value: stats?.totalTokens },
    {
      key: "reasoning",
      label: t("topNav.usage.metric.reasoning"),
      value: getReasoningTokens(stats),
    },
    {
      key: "cacheHit",
      label: t("topNav.usage.metric.cacheHit"),
      value: stats?.promptCacheHitTokens ?? getCachedTokens(stats),
    },
    {
      key: "cacheMiss",
      label: t("topNav.usage.metric.cacheMiss"),
      value: stats?.promptCacheMissTokens,
    },
  ];
}

function resolveContextPercent(snapshot: AIUsageSnapshotEvent | null): number | null {
  const currentSize = readUsageNumber(snapshot?.contextWindow?.currentSize);
  const maxSize = readUsageNumber(snapshot?.contextWindow?.maxSize);
  if (currentSize == null || maxSize == null || maxSize <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((currentSize / maxSize) * 100)));
}

const UsageContextWindow: React.FC<{
  snapshot: AIUsageSnapshotEvent;
  t: (key: string, values?: Record<string, string>) => string;
}> = ({ snapshot, t }) => {
  const percent = resolveContextPercent(snapshot);
  const progressValue = percent ?? 0;

  return (
    <div className="usage-context-window">
      <div
        className="usage-context-ring"
        style={{ "--usage-context-percent": `${progressValue}%` } as React.CSSProperties}
        aria-label={t("topNav.usage.contextWindow")}
      >
        <span>{percent == null ? "--%" : `${percent}%`}</span>
      </div>
      <div className="usage-context-copy">
        <span>{t("topNav.usage.contextWindow")}</span>
        <strong>
          {formatUsageNumber(snapshot.contextWindow?.currentSize)}
          {" / "}
          {formatUsageNumber(snapshot.contextWindow?.maxSize)}
        </strong>
        <small>
          {t("topNav.usage.estimatedNext", {
            value: formatUsageNumber(snapshot.contextWindow?.estimatedNextCallSize),
          })}
        </small>
      </div>
    </div>
  );
};

const UsageTriggerRing: React.FC<{
  snapshot: AIUsageSnapshotEvent | null;
  label: string;
}> = ({ snapshot, label }) => {
  const percent = resolveContextPercent(snapshot);
  const progressValue = percent ?? 0;

  return (
    <span
      className="usage-trigger-ring"
      style={{ "--usage-context-percent": `${progressValue}%` } as React.CSSProperties}
      aria-label={label}
    >
      <span>{percent == null ? "--" : `${percent}%`}</span>
    </span>
  );
};

const UsageSection: React.FC<{
  title: string;
  metrics: UsageMetric[];
  aside?: React.ReactNode;
}> = ({ title, metrics, aside }) => (
  <section className="usage-popover-section">
    <div className="usage-popover-section-title">
      <h3>{title}</h3>
      {aside}
    </div>
    <dl className="usage-metric-grid">
      {metrics.map((metric) => (
        <div className="usage-metric" key={metric.key}>
          <dt>{metric.label}</dt>
          <dd>{formatUsageNumber(metric.value)}</dd>
        </div>
      ))}
    </dl>
  </section>
);

const UsageLlmCalls: React.FC<{
  label: string;
  value: unknown;
}> = ({ label, value }) => (
  <span className="usage-section-llm-calls">
    {label}
    <strong>{formatUsageNumber(value)}</strong>
  </span>
);

export const TopNav: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const ui = selectUiState(state);
  const conversation = selectConversationState(state);
  const { statusClass, statusText } = resolveTopNavStatus(state);
  const currentWorker = resolveCurrentWorkerSummary(state);
  const voiceEnabled = isVoiceEnabled();
  const voiceModeAvailable = voiceEnabled && currentWorker?.type === "agent";
  const showMuteControl = voiceEnabled && (voiceModeAvailable || ui.audioMuted);
  const debugPanelEnabled = isDebugPanelEnabled();
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
  const usageSnapshot = state.usageSnapshot;
  const showUsageControl = Boolean(usageSnapshot) || state.streaming;
  const usageTotal = resolveDisplayTotal(usageSnapshot);
  const usageTriggerLabel =
    usageTotal == null
      ? t("topNav.usage.waitingShort")
      : formatCompactUsageNumber(usageTotal);

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

  const handleToggleUsagePopover = React.useCallback(() => {
    if (!showUsageControl) return;
    dispatch({
      type: "SET_USAGE_POPOVER_OPEN",
      open: resolveNextUsagePopoverOpen(state.usagePopoverOpen),
    });
  }, [dispatch, showUsageControl, state.usagePopoverOpen]);

  const handleCloseUsagePopover = React.useCallback(() => {
    dispatch({ type: "SET_USAGE_POPOVER_OPEN", open: false });
  }, [dispatch]);

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

  const toggleRightSidebar = (tab: RightSidebarTabKey) => {
    if (state.rightSidebarOpen && tab === state.rightSidebarOpenTab) {
      dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
      return;
    }

    dispatch({
      type: "OPEN_RIGHT_SIDEBAR",
      tab,
    });
  };

  return (
    <nav className="top-nav">
      <div className="top-nav-inner">
        <div className="nav-group nav-left">
        </div>

        <div className="nav-group nav-center">
          <div className={`current-worker-card`} aria-live="polite">
            <strong className="current-worker-name">
              {currentWorker?.displayName || t("topNav.noSelection")}
            </strong>
            <span className={`status-pill ${statusClass}`} id="api-status">
              {t(statusText)}
            </span>
            {showUsageControl ? (
              <div className="usage-popover-anchor">
                <UiButton
                  className="usage-trigger"
                  variant="ghost"
                  size="sm"
                  active={state.usagePopoverOpen}
                  aria-label={t("topNav.usage.open")}
                  title={t("topNav.usage.open")}
                  onClick={handleToggleUsagePopover}
                >
                  <UsageTriggerRing
                    snapshot={usageSnapshot}
                    label={t("topNav.usage.contextWindow")}
                  />
                  <span className="usage-trigger-total">{usageTriggerLabel}</span>
                </UiButton>
                {state.usagePopoverOpen ? (
                  <div
                    className="usage-popover"
                    role="dialog"
                    aria-label={t("topNav.usage.title")}
                  >
                    <div className="usage-popover-header">
                      <div>
                        <strong>{t("topNav.usage.title")}</strong>
                        <span>
                          {usageSnapshot?.model?.key || t("topNav.usage.modelUnknown")}
                        </span>
                      </div>
                      <UiButton
                        className="usage-popover-close"
                        variant="ghost"
                        size="sm"
                        iconOnly
                        aria-label={t("topNav.usage.close")}
                        title={t("topNav.usage.close")}
                        onClick={handleCloseUsagePopover}
                      >
                        <span className="usage-popover-close-glyph" aria-hidden="true" />
                      </UiButton>
                    </div>
                    {usageSnapshot ? (
                      <>
                        <UsageContextWindow snapshot={usageSnapshot} t={t} />
                        <UsageSection
                          title={t("topNav.usage.section.current")}
                          metrics={buildUsageMetrics(t, usageSnapshot.usage?.current)}
                        />
                        <UsageSection
                          title={t("topNav.usage.section.run")}
                          metrics={buildUsageMetrics(t, usageSnapshot.usage?.run)}
                          aside={
                            <UsageLlmCalls
                              label={t("topNav.usage.metric.llmCalls")}
                              value={usageSnapshot.usage?.run?.llmChatCompletionCount}
                            />
                          }
                        />
                        <UsageSection
                          title={t("topNav.usage.section.chat")}
                          metrics={buildUsageMetrics(t, usageSnapshot.usage?.chat)}
                          aside={
                            <UsageLlmCalls
                              label={t("topNav.usage.metric.llmCalls")}
                              value={usageSnapshot.usage?.chat?.llmChatCompletionCount}
                            />
                          }
                        />
                      </>
                    ) : (
                      <p className="usage-popover-empty">
                        {t("topNav.usage.waiting")}
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
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
          {debugPanelEnabled ? (
            <UiButton
              className="icon-btn"
              size="sm"
              variant="ghost"
              iconOnly
              aria-label={
                ui.rightSidebarOpen
                  ? t("topNav.debug.close")
                  : t("topNav.debug.open")
              }
              active={
                state.rightSidebarOpen && state.rightSidebarOpenTab === "debug"
              }
              onClick={() => toggleRightSidebar("debug")}
            >
              <MaterialIcon name="bug_report" />
            </UiButton>
          ) : null}
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
          <UiButton
            className="icon-btn"
            size="sm"
            variant="ghost"
            iconOnly
            active={
              state.rightSidebarOpen && state.rightSidebarOpenTab !== "debug"
            }
            onClick={() => toggleRightSidebar("overview")}
          >
            <MaterialIcon name="dock_to_left" />
          </UiButton>
        </div>
      </div>
    </nav>
  );
};
