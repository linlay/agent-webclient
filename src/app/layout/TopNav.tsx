import React from "react";
import { useAppState, useAppDispatch } from "@/app/state/AppContext";
import { selectConversationState, selectUiState } from "@/app/state/selectors";
import type {
  AIUsageEstimatedCost,
  AIUsageSnapshotEvent,
  AIUsageStats,
  AppState,
  RightSidebarTabKey,
} from "@/app/state/types";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import {
  isDebugPanelEnabled,
  isVoiceEnabled,
} from "@/shared/config/featureFlags";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { Divider, Flex, Progress, Typography } from "antd";
import { TextCountUp } from "@/shared/components/text-count-up";

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
  if (numberValue >= 1_000_000)
    return `${(numberValue / 1_000_000).toFixed(1)}M`;
  if (numberValue >= 1_000) return `${(numberValue / 1_000).toFixed(1)}K`;
  return numberValue.toLocaleString();
}

function trimTrailingZeros(value: string): string {
  return value.replace(/\.?0+$/, "");
}

function formatMoneyAmount(value: number): string {
  if (value >= 0.01) return trimTrailingZeros(value.toFixed(3));
  return trimTrailingZeros(value.toFixed(6));
}

function formatChatEstimatedCost(cost?: AIUsageEstimatedCost): string {
  const total = readUsageNumber(cost?.total);
  if (total == null || total < 0) return "--";

  const currency = cost?.currency?.toUpperCase();
  if (currency === "USD") {
    return `$${formatMoneyAmount(total)}`;
  }

  if (currency === "CNY" || currency === "RMB" || currency === "CNH") {
    if (total <= 0.1) return `¥ ${(total * 100).toFixed(2)} 分`;
    return `¥ ${trimTrailingZeros(total.toFixed(3))} 元`;
  }

  return formatMoneyAmount(total);
}

function resolveDisplayTotal(
  snapshot: AIUsageSnapshotEvent | null,
): number | null {
  return readUsageNumber(snapshot?.usage?.chat?.totalTokens);
}

export function resolveNextUsagePopoverOpen(isOpen: boolean): boolean {
  return !isOpen;
}

function getReasoningTokens(stats?: AIUsageStats): unknown {
  return stats?.completionTokensDetails?.reasoningTokens;
}

function getCacheHitTokens(stats?: AIUsageStats): unknown {
  return stats?.promptTokensDetails?.cacheHitTokens;
}

function getCacheMissTokens(stats?: AIUsageStats): unknown {
  return stats?.promptTokensDetails?.cacheMissTokens;
}

interface UsageMetric {
  key: string;
  label: string;
  value: unknown;
}

function buildUsageMetrics(
  t: (key: string) => string,
  stats?: AIUsageStats,
): UsageMetric[] {
  return [
    {
      key: "prompt",
      label: t("topNav.usage.metric.prompt"),
      value: stats?.promptTokens,
    },
    {
      key: "completion",
      label: t("topNav.usage.metric.completion"),
      value: stats?.completionTokens,
    },
    {
      key: "total",
      label: t("topNav.usage.metric.total"),
      value: stats?.totalTokens,
    },
    {
      key: "reasoning",
      label: t("topNav.usage.metric.reasoning"),
      value: getReasoningTokens(stats),
    },
    {
      key: "cacheHit",
      label: t("topNav.usage.metric.cacheHit"),
      value: getCacheHitTokens(stats),
    },
    {
      key: "cacheMiss",
      label: t("topNav.usage.metric.cacheMiss"),
      value: getCacheMissTokens(stats),
    },
  ];
}

function resolveLatestCompactUsage(
  events: AppState["events"],
): AIUsageStats | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index] as Record<string, unknown>;
    if (event.type !== "context.compact.complete") {
      continue;
    }
    const usage = event.compactionUsage;
    if (!usage || typeof usage !== "object") {
      return null;
    }
    return usage as AIUsageStats;
  }
  return null;
}

function resolveContextPercent(
  snapshot: AIUsageSnapshotEvent | null,
): number | null {
  const currentSize = readUsageNumber(snapshot?.contextWindow?.currentSize);
  const maxSize = readUsageNumber(snapshot?.contextWindow?.maxSize);
  if (currentSize == null || maxSize == null || maxSize <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((currentSize / maxSize) * 100)));
}

function resolveChatCacheHitPercent(
  snapshot: AIUsageSnapshotEvent | null,
): number | null {
  const promptDetails = snapshot?.usage?.chat?.promptTokensDetails;
  const hitTokens = readUsageNumber(promptDetails?.cacheHitTokens);
  const missTokens = readUsageNumber(promptDetails?.cacheMissTokens);
  if (hitTokens == null || missTokens == null) return null;
  const totalTokens = hitTokens + missTokens;
  if (totalTokens <= 0) return null;
  return Math.max(0, Math.min(100, (hitTokens / totalTokens) * 100));
}

function formatUsagePercent(value: number | null): string {
  return value == null ? "--%" : `${value.toFixed(2)}%`;
}

function resolveChatEstimatedCost(
  snapshot: AIUsageSnapshotEvent | null,
): AIUsageEstimatedCost | undefined {
  return snapshot?.usage?.chat?.estimatedCost;
}

const UsageContextWindow: React.FC<{
  snapshot: AIUsageSnapshotEvent | null;
  t: (key: string, values?: Record<string, string>) => string;
}> = ({ snapshot, t }) => {
  const cacheHitPercent = resolveChatCacheHitPercent(snapshot);
  const cacheHitLabel = formatUsagePercent(cacheHitPercent);

  return (
    <div className="usage-context-window">
      <div className="usage-context-copy">
        <span>{t("topNav.usage.contextWindow")}</span>
        <strong>
          {formatUsageNumber(snapshot?.contextWindow?.currentSize)}
          {" / "}
          {formatUsageNumber(snapshot?.contextWindow?.maxSize)}
        </strong>
      </div>

      <div
        className="usage-cache-hit-inline"
        aria-label={t("topNav.usage.cacheHitRate")}
      >
        <span>{t("topNav.usage.cacheHitRate")}:</span>
        <strong>{cacheHitLabel}</strong>
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
      style={
        {
          "--usage-context-percent": `${progressValue}%`,
        } as React.CSSProperties
      }
      aria-label={label}
    >
      <span>{percent == null ? "-" : `${percent}`}</span>
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

const UsageCallCounts: React.FC<{
  t: (key: string) => string;
  stats?: AIUsageStats;
}> = ({ t, stats }) => {
  const counts = [
    {
      key: "llm",
      label: t("topNav.usage.metric.llmCalls"),
      value: stats?.llmChatCompletionCount,
    },
    {
      key: "tool",
      label: t("topNav.usage.metric.toolCalls"),
      value: stats?.toolCallCount,
    },
  ].filter((count) => readUsageNumber(count.value) != null);

  if (counts.length === 0) {
    return null;
  }

  return (
    <span className="usage-section-call-counts">
      {counts.map((count) => (
        <span className="usage-section-llm-calls" key={count.key}>
          {count.label}
          <strong>{formatUsageNumber(count.value)}</strong>
        </span>
      ))}
    </span>
  );
};

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
  const compactUsage = resolveLatestCompactUsage(state.events);
  const showUsageControl =
    Boolean(usageSnapshot) || Boolean(compactUsage) || state.streaming;
  const usageTotal = resolveDisplayTotal(usageSnapshot);
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
  const percent = resolveContextPercent(usageSnapshot);
  const estimatedCostLabel = formatChatEstimatedCost(
    resolveChatEstimatedCost(usageSnapshot),
  );
  return (
    <nav className="top-nav">
      <div className="top-nav-inner">
        <div className="nav-group nav-left"></div>

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
                  {usageTotal == null ? (
                    t("topNav.usage.waitingShort")
                  ) : (
                    <TextCountUp text={formatCompactUsageNumber(usageTotal)} />
                  )}
                </UiButton>
                {state.usagePopoverOpen ? (
                  <div
                    className="usage-popover"
                    role="dialog"
                    aria-label={t("topNav.usage.title")}
                  >
                    <Flex gap={10} align="center">
                      <div
                        className="usage-context-ring"
                        style={
                          {
                            "--usage-context-percent": `${percent ?? 0}%`,
                          } as React.CSSProperties
                        }
                        aria-label={t("topNav.usage.contextWindow")}
                      >
                        <span>{percent == null ? "--%" : `${percent}%`}</span>
                      </div>
                      <Flex vertical style={{ flex: 1, overflow: "hidden" }}>
                        <div className="usage-popover-header">
                          <Flex
                            gap={8}
                            align="center"
                            style={{ overflow: "hidden", whiteSpace: "nowrap" }}
                          >
                            <strong>{t("topNav.usage.title")}</strong>
                            <Typography.Text
                              ellipsis={{ tooltip: usageSnapshot?.model?.key }}
                            >
                              {usageSnapshot?.model?.key ||
                                t("topNav.usage.modelUnknown")}
                            </Typography.Text>
                          </Flex>
                          <Flex align="center" gap={8}>
                            <div
                              className="usage-cache-hit-inline"
                              aria-label={t("topNav.usage.totalCost")}
                            >
                              <span>{t("topNav.usage.totalCost")}:</span>
                              <strong>{estimatedCostLabel}</strong>
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
                              <span
                                className="usage-popover-close-glyph"
                                aria-hidden="true"
                              />
                            </UiButton>
                          </Flex>
                        </div>
                        <UsageContextWindow snapshot={usageSnapshot} t={t} />
                      </Flex>
                    </Flex>
                    <UsageSection
                      title={t("topNav.usage.section.current")}
                      metrics={buildUsageMetrics(
                        t,
                        usageSnapshot?.usage?.current,
                      )}
                      aside={
                        <UsageCallCounts
                          t={t}
                          stats={usageSnapshot?.usage?.current}
                        />
                      }
                    />
                    <UsageSection
                      title={t("topNav.usage.section.run")}
                      metrics={buildUsageMetrics(t, usageSnapshot?.usage?.run)}
                      aside={
                        <UsageCallCounts
                          t={t}
                          stats={usageSnapshot?.usage?.run}
                        />
                      }
                    />
                    <UsageSection
                      title={t("topNav.usage.section.chat")}
                      metrics={buildUsageMetrics(t, usageSnapshot?.usage?.chat)}
                      aside={
                        <UsageCallCounts
                          t={t}
                          stats={usageSnapshot?.usage?.chat}
                        />
                      }
                    />
                    {compactUsage ? (
                      <UsageSection
                        title={t("topNav.usage.section.compact")}
                        metrics={buildUsageMetrics(t, compactUsage)}
                        aside={<UsageCallCounts t={t} stats={compactUsage} />}
                      />
                    ) : null}
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
