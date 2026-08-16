import React from "react";
import {
  useOptionalAppContext,
  useAppState,
  useAppDispatch,
} from "@/app/state/AppContext";
import { selectConversationState, selectUiState } from "@/app/state/selectors";
import type {
  AIUsageEstimatedCost,
  AIUsageSnapshotEvent,
  AIUsageStats,
  AppState,
  RightSidebarTabKey,
} from "@/app/state/types";
import {
  resolveCurrentWorkerSummary,
  isCoderAgent,
  isDedicatedKbaseWorker,
} from "@/features/workers/lib/currentWorker";
import {
  isDebugPanelEnabled,
  isVoiceEnabled,
} from "@/shared/config/featureFlags";
import { formatPlatformErrorForDisplay } from "@/shared/data/errors/platformError";
import { tOrFallback, useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { Divider, Flex, Popover, Typography } from "antd";
import { TextCountUp } from "@/shared/components/text-count-up";
import { useSettingsOverlayState } from "@/features/settings/components/SettingsOverlayProvider";
import { useCommandOverlayOpen } from "@/features/workers/components/CommandOverlayProvider";
import { useBackgroundCommandActions } from "@/features/composer/hooks/useBackgroundCommandActions";
import { useGlobalSearchOpen } from "@/features/search/components/GlobalSearchOverlayProvider";
import { useTerminalAgentStatuses } from "@/features/terminal/hooks/useActiveTerminalAgents";
import { resolveMainChatRuntime } from "@/features/runs/lib/runRuntimeState";
import { useOpenTarget } from "@/features/surfaces/openTarget";

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

const TOP_NAV_CLASS = "top-nav tw:col-[2/3] tw:row-start-1 tw:pr-1.5";
const TOP_NAV_INNER_CLASS =
  "top-nav-inner tw:flex tw:min-h-[var(--top-nav-height)] tw:w-full tw:items-center tw:justify-between tw:gap-3";
const NAV_GROUP_CLASS = "nav-group tw:flex tw:items-center";
const NAV_LEFT_CLASS =
  "nav-group nav-left tw:flex tw:w-[150px] tw:items-center tw:justify-between tw:gap-3 tw:pl-3";
const NAV_CENTER_CLASS =
  "nav-group nav-center tw:flex tw:min-w-0 tw:items-center tw:justify-center tw:shrink-0";
const CURRENT_WORKER_CARD_CLASS =
  "current-worker-card tw:relative tw:flex tw:items-center tw:justify-center tw:gap-2.5 tw:max-[1279px]:min-w-0 tw:max-[1279px]:gap-2 tw:max-[1279px]:px-3 tw:max-[1279px]:py-[7px]";
const CURRENT_WORKER_NAME_CLASS =
  "current-worker-name tw:min-w-0 tw:flex-auto tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-sm tw:font-semibold tw:leading-[1.2] tw:text-ink-1";
const KBASE_EDITING_BADGE_CLASS =
  "kbase-editing-badge tw:inline-flex tw:flex-none tw:items-center tw:whitespace-nowrap tw:rounded-lg tw:bg-[color-mix(in_srgb,var(--accent-warn)_14%,transparent)] tw:px-2 tw:py-1 tw:text-[10px] tw:font-semibold tw:text-accent-warn";
const TOP_NAV_ICON_BUTTON_CLASS =
  "top-nav-icon-btn ui-icon-hover-24 tw:h-8 tw:min-h-8 tw:w-8 tw:min-w-8 tw:rounded-lg tw:p-0 tw:max-[1279px]:h-[34px] tw:max-[1279px]:min-h-[34px] tw:max-[1279px]:w-[34px] tw:max-[1279px]:min-w-[34px] tw:[&_.material-icon]:h-4 tw:[&_.material-icon]:w-4 tw:[&_.material-icon]:text-base";
const TOP_NAV_DEBUG_BUTTON_CLASS =
  "top-nav-icon-btn ui-icon-hover-24 tw:h-8 tw:min-h-8 tw:w-8 tw:min-w-8 tw:rounded-lg tw:p-0 tw:max-[1279px]:h-[34px] tw:max-[1279px]:min-h-[34px] tw:max-[1279px]:w-[34px] tw:max-[1279px]:min-w-[34px] tw:[&_.material-icon]:h-4 tw:[&_.material-icon]:w-4 tw:[&_.material-icon]:text-base";
const CURRENT_WORKER_TOOL_BASE_CLASS =
  "current-worker-tool tw:h-8 tw:min-h-8 tw:w-8 tw:min-w-8 tw:rounded-lg tw:p-0 tw:max-[1279px]:h-[34px] tw:max-[1279px]:min-h-[34px] tw:max-[1279px]:w-[34px] tw:max-[1279px]:min-w-[34px] tw:[&_.material-icon]:text-lg";
const VOICE_TOOL_CLASS_BY_MODE = {
  call: [
    CURRENT_WORKER_TOOL_BASE_CLASS,
    "current-worker-tool-voice is-call tw:text-[#2f7c49]",
  ].join(" "),
  hangup: [
    CURRENT_WORKER_TOOL_BASE_CLASS,
    "current-worker-tool-voice is-hangup tw:border tw:[border-color:color-mix(in_srgb,#f06b67_44%,var(--line-soft))] tw:bg-[color-mix(in_srgb,#fff0ef_86%,var(--bg-elev-2))] tw:text-[#d53f3f] tw:hover:[border-color:color-mix(in_srgb,#e4564f_52%,var(--line-soft))] tw:hover:shadow-[0_8px_18px_rgba(229,86,79,0.18)]",
  ].join(" "),
} as const;
const MUTED_TOOL_ACTIVE_CLASS =
  "is-muted tw:border tw:[border-color:color-mix(in_srgb,#ff945f_38%,var(--line-soft))] tw:bg-[color-mix(in_srgb,#fff0e6_84%,var(--bg-elev-2))] tw:text-[#cf5f18]";
const USAGE_CONTEXT_WINDOW_CLASS =
  "usage-context-window tw:flex tw:flex-wrap tw:items-center tw:gap-1.5 tw:rounded-lg tw:bg-[color-mix(in_srgb,var(--accent-soft)_58%,transparent)] tw:px-1.5 tw:py-1";
const USAGE_CONTEXT_COPY_CLASS =
  "usage-context-copy tw:inline-flex tw:min-w-0 tw:flex-1 tw:flex-wrap tw:items-baseline tw:gap-2 tw:[&>small]:flex-none tw:[&>small]:text-[9px] tw:[&>small]:leading-[1.1] tw:[&>small]:text-ink-2 tw:[&>span]:flex-none tw:[&>span]:text-[9px] tw:[&>span]:leading-[1.1] tw:[&>span]:text-ink-muted tw:[&>strong]:flex-none tw:[&>strong]:[overflow-wrap:anywhere] tw:[&>strong]:font-code tw:[&>strong]:text-[10px] tw:[&>strong]:font-bold tw:[&>strong]:leading-[1.1]";
const USAGE_CONTEXT_COMPACT_BTN_CLASS =
  "usage-context-compact-btn tw:min-h-[18px] tw:flex-none tw:rounded-md tw:px-1.5 tw:py-0 tw:text-[9px] tw:leading-none";
const USAGE_CACHE_HIT_INLINE_CLASS =
  "usage-cache-hit-inline tw:inline-flex tw:min-w-max tw:items-baseline tw:gap-1 tw:whitespace-nowrap tw:text-[9px] tw:leading-[1.1] tw:text-ink-muted tw:[&>strong]:font-code tw:[&>strong]:text-[10px] tw:[&>strong]:font-bold tw:[&>strong]:leading-[1.1] tw:[&>strong]:text-ink-1";
const USAGE_TRIGGER_RING_CLASS =
  "usage-trigger-ring tw:grid tw:h-[26px] tw:w-[26px] tw:flex-none tw:place-items-center tw:rounded-full tw:bg-[radial-gradient(circle_at_center,var(--bg-elev-2)_0_46%,transparent_50%),conic-gradient(var(--accent-electric)_var(--usage-context-percent,0%),var(--line-soft)_0)] tw:[&>span]:font-code tw:[&>span]:text-[11px] tw:[&>span]:font-bold tw:[&>span]:leading-none tw:[&>span]:text-ink-1";
const USAGE_POPOVER_SECTION_CLASS =
  "usage-popover-section tw:mt-1.5 tw:[&_h3]:m-0 tw:[&_h3]:text-[11px] tw:[&_h3]:font-bold tw:[&_h3]:text-ink-2";
const USAGE_POPOVER_SECTION_TITLE_CLASS =
  "usage-popover-section-title tw:mb-[3px] tw:mr-1 tw:flex tw:items-center tw:justify-between tw:gap-2";
const USAGE_METRIC_GRID_CLASS =
  "usage-metric-grid tw:m-0 tw:grid tw:grid-cols-3 tw:gap-1";
const USAGE_METRIC_CLASS =
  "usage-metric tw:flex tw:min-w-0 tw:items-center tw:justify-between tw:gap-1 tw:rounded-[7px] tw:border tw:[border-color:color-mix(in_srgb,var(--line-soft)_72%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-elev)_68%,transparent)] tw:px-[5px] tw:py-[3px] tw:[&_dd]:m-0 tw:[&_dd]:[overflow-wrap:anywhere] tw:[&_dd]:font-code tw:[&_dd]:text-[10px] tw:[&_dd]:font-bold tw:[&_dd]:leading-[1.15] tw:[&_dd]:text-ink-1 tw:[&_dt]:m-0 tw:[&_dt]:overflow-hidden tw:[&_dt]:text-ellipsis tw:[&_dt]:whitespace-nowrap tw:[&_dt]:text-[9px] tw:[&_dt]:leading-[1.2] tw:[&_dt]:text-ink-muted";
const USAGE_SECTION_CALL_COUNTS_CLASS =
  "usage-section-call-counts tw:inline-flex tw:min-w-0 tw:flex-wrap tw:items-center tw:justify-end tw:gap-2";
const USAGE_SECTION_STAT_CLASS =
  "usage-section-stat tw:inline-flex tw:min-w-0 tw:items-center tw:gap-1 tw:whitespace-nowrap tw:text-[9px] tw:leading-none tw:text-ink-muted tw:[&>strong]:font-code tw:[&>strong]:text-[10px] tw:[&>strong]:font-bold tw:[&>strong]:leading-none tw:[&>strong]:text-ink-1";
const USAGE_TRIGGER_CLASS = "usage-trigger";
const USAGE_POPOVER_ROOT_CLASS = "usage-popover";
const USAGE_CONTEXT_RING_CLASS =
  "usage-context-ring tw:grid tw:h-11 tw:w-11 tw:flex-none tw:place-items-center tw:rounded-full tw:bg-[radial-gradient(circle_at_center,var(--bg-elev-2)_0_54%,transparent_55%),conic-gradient(var(--accent-electric)_var(--usage-context-percent,0%),color-mix(in_srgb,var(--line-soft)_76%,transparent)_0)] tw:[&>span]:font-code tw:[&>span]:text-sm tw:[&>span]:font-bold tw:[&>span]:leading-none tw:[&>span]:text-ink-1";
const USAGE_POPOVER_HEADER_CLASS =
  "usage-popover-header tw:mb-1 tw:flex tw:items-center tw:justify-between tw:gap-3 tw:[&_span]:max-w-[340px] tw:[&_span]:overflow-hidden tw:[&_span]:text-ellipsis tw:[&_span]:whitespace-nowrap tw:[&_span]:text-[10px] tw:[&_span]:font-medium tw:[&_span]:leading-[1.15] tw:[&_span]:text-ink-muted tw:[&_strong]:text-[11px] tw:[&_strong]:leading-[1.15]";
const USAGE_POPOVER_CLOSE_CLASS =
  "usage-popover-close tw:h-5 tw:min-h-5 tw:w-5 tw:min-w-5 tw:rounded-[7px] tw:p-0";

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
  for (let index = state.events.length - 1; index > lastRunStartIndex; index -= 1) {
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

function readUsageNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function formatUsageNumber(value: unknown): string {
  const numberValue = readUsageNumber(value);
  return numberValue == null ? "-" : numberValue.toLocaleString();
}

function readUsageTimingNumber(value: unknown): number | null {
  if (value == null) return null;
  const numberValue = readUsageNumber(value);
  return numberValue == null || numberValue < 0 ? null : numberValue;
}

function formatFirstTokenLatency(value: unknown): string | null {
  const latencyMs = readUsageTimingNumber(value);
  if (latencyMs == null) return null;
  if (latencyMs < 1000) return `${Math.round(latencyMs)}ms`;
  return `${(latencyMs / 1000).toFixed(1)}s`;
}

function resolveFirstTokenLatency(stats?: AIUsageStats): number | null {
  const directLatency = readUsageTimingNumber(stats?.timing?.firstTokenLatencyMs);
  if (directLatency != null) return directLatency;
  const totalLatency = readUsageTimingNumber(stats?.timing?.firstTokenLatencyTotalMs);
  const count = readUsageTimingNumber(stats?.timing?.firstTokenLatencyCount);
  if (totalLatency == null || totalLatency <= 0 || count == null || count <= 0) return null;
  return totalLatency / count;
}

function formatOutputTokensPerSecond(value: unknown): string | null {
  const tokensPerSecond = readUsageTimingNumber(value);
  if (tokensPerSecond == null) return null;
  return `${tokensPerSecond.toFixed(1)}/s`;
}

function resolveOutputTokensPerSecond(stats?: AIUsageStats): number | null {
  const completionTokens = readUsageTimingNumber(stats?.completionTokens);
  const generationDurationMs = readUsageTimingNumber(stats?.timing?.generationDurationMs);
  if (completionTokens == null || completionTokens <= 0 || generationDurationMs == null || generationDurationMs <= 0) {
    return null;
  }
  return (completionTokens * 1000) / generationDurationMs;
}

function formatCompactUsageNumber(value: unknown): string {
  const numberValue = readUsageNumber(value);
  if (numberValue == null) return "-";
  if (numberValue >= 1_000_000)
    return `${(numberValue / 1_000_000).toFixed(1)}M`;
  if (numberValue >= 1_000) return `${(numberValue / 1_000).toFixed(1)}K`;
  return numberValue.toLocaleString();
}


function formatChatEstimatedCost(
  cost?: AIUsageEstimatedCost,
  locale: string = "zh-CN"
): string {
  const total = readUsageNumber(cost?.total);
  if (total == null || total < 0) return "--";

  const currency = cost?.currency?.toUpperCase();
  if (currency === "USD") {
    return new Intl.NumberFormat(locale, {
      style: "currency", currencyDisplay: "symbol",
      currency: "USD",
    }).format(total);
  }

  if (currency === "CNY" || currency === "RMB" || currency === "CNH") {
    // 默认只使用中文环境下的货币格式化: ¥1,234.5678
    // en-US 环境下格式为: CN¥1,234.5678
    return new Intl.NumberFormat("zh-CN", {
      style: "currency", currencyDisplay: "symbol",
      currency: "CNY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(total);
  }

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(total);
}

function resolveDisplayTotal(
  snapshot: AIUsageSnapshotEvent | null,
): number | null {
  return readUsageNumber(snapshot?.usage?.chat?.totalTokens);
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

function hasUsageStatsData(stats?: AIUsageStats): boolean {
  if (!stats) return false;
  const numericValues = [
    stats.promptTokens,
    stats.completionTokens,
    stats.totalTokens,
    stats.llmChatCompletionCount,
    stats.toolCallCount,
    stats.promptTokensDetails?.cacheHitTokens,
    stats.promptTokensDetails?.cacheMissTokens,
    stats.completionTokensDetails?.reasoningTokens,
    stats.timing?.firstTokenLatencyMs,
    stats.timing?.firstTokenLatencyTotalMs,
    stats.timing?.firstTokenLatencyCount,
    stats.timing?.generationDurationMs,
  ];
  if (numericValues.some((value) => readUsageNumber(value) != null)) return true;
  return Boolean(stats.estimatedCost);
}

interface UsageMetric {
  key: string;
  label: string;
  value: unknown;
}

interface UsageHeaderStat {
  key: string;
  label: string;
  value: string;
}

interface UsageContextPercent {
  label: string;
  progress: number;
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
): UsageContextPercent | null {
  const currentSize = readUsageNumber(snapshot?.contextWindow?.currentSize);
  const maxSize = readUsageNumber(snapshot?.contextWindow?.maxSize);
  if (currentSize == null || maxSize == null || maxSize <= 0) return null;
  const percent = Math.max(0, Math.round((currentSize / maxSize) * 100));
  return {
    label: percent > 999 ? ">999" : `${percent}`,
    progress: Math.min(100, percent),
  };
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
  compactDisabled: boolean;
  onCompact: () => void;
  snapshot: AIUsageSnapshotEvent | null;
  t: (key: string, values?: Record<string, string>) => string;
}> = ({ compactDisabled, onCompact, snapshot, t }) => {
  const cacheHitPercent = resolveChatCacheHitPercent(snapshot);
  const cacheHitLabel = formatUsagePercent(cacheHitPercent);

  return (
    <div className={USAGE_CONTEXT_WINDOW_CLASS}>
      <div className={USAGE_CONTEXT_COPY_CLASS}>
        <span>{t("topNav.usage.contextWindow")}</span>
        <strong>
          {formatUsageNumber(snapshot?.contextWindow?.currentSize)}
          {" / "}
          {formatUsageNumber(snapshot?.contextWindow?.maxSize)}
        </strong>
        <UiButton
          className={USAGE_CONTEXT_COMPACT_BTN_CLASS}
          variant="ghost"
          size="sm"
          disabled={compactDisabled}
          aria-label={t("topNav.usage.compact")}
          title={t("topNav.usage.compact")}
          onClick={onCompact}
        >
          {t("topNav.usage.compact")}
        </UiButton>
      </div>

      <div
        className={USAGE_CACHE_HIT_INLINE_CLASS}
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
  const contextPercent = resolveContextPercent(snapshot);
  const progressValue = contextPercent?.progress ?? 0;

  return (
    <span
      className={USAGE_TRIGGER_RING_CLASS}
      style={
        {
          "--usage-context-percent": `${progressValue}%`,
        } as React.CSSProperties
      }
      aria-label={label}
    >
      <span>{contextPercent?.label ?? "-"}</span>
    </span>
  );
};

const UsageSection: React.FC<{
  title: string;
  metrics: UsageMetric[];
  aside?: React.ReactNode;
}> = ({ title, metrics, aside }) => (
  <section className={USAGE_POPOVER_SECTION_CLASS}>
    <div className={USAGE_POPOVER_SECTION_TITLE_CLASS}>
      <h3>{title}</h3>
      {aside}
    </div>
    <dl className={USAGE_METRIC_GRID_CLASS}>
      {metrics.map((metric) => (
        <div className={USAGE_METRIC_CLASS} key={metric.key}>
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
  showFirstTokenLatency?: boolean;
  showOutputSpeed?: boolean;
}> = ({ t, stats, showFirstTokenLatency = false, showOutputSpeed = false }) => {
  const headerStats: UsageHeaderStat[] = [];
  if (showFirstTokenLatency) {
    const firstTokenLatency = formatFirstTokenLatency(resolveFirstTokenLatency(stats));
    if (firstTokenLatency) {
      headerStats.push({
        key: "firstTokenLatency",
        label: t("topNav.usage.metric.firstTokenLatency"),
        value: firstTokenLatency,
      });
    }
  }

  if (showOutputSpeed) {
    const outputSpeed = formatOutputTokensPerSecond(resolveOutputTokensPerSecond(stats));
    if (outputSpeed) {
      headerStats.push({
        key: "outputTokensPerSecond",
        label: t("topNav.usage.metric.outputTokensPerSecond"),
        value: outputSpeed,
      });
    }
  }

  [
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
  ].forEach((count) => {
    let value = count.value;
    if (count.key === "tool" && readUsageNumber(value) == null && hasUsageStatsData(stats)) {
      value = 0;
    }
    if (readUsageNumber(value) == null) return;
    headerStats.push({
      key: count.key,
      label: count.label,
      value: formatUsageNumber(value),
    });
  });

  if (headerStats.length === 0) {
    return null;
  }

  return (
    <span className={USAGE_SECTION_CALL_COUNTS_CLASS}>
      {headerStats.map((stat) => (
        <span className={USAGE_SECTION_STAT_CLASS} key={stat.key}>
          {stat.label}
          <strong>{stat.value}</strong>
        </span>
      ))}
    </span>
  );
};

export const TopNav: React.FC<{ surface?: "root" | "agent" }> = ({ surface = "root" }) => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const appContext = useOptionalAppContext();
  const { t, locale } = useI18n();
  const openTarget = useOpenTarget();
  const terminalAgentStatuses = useTerminalAgentStatuses();
  const { isAnyOverlayOpen } = useSettingsOverlayState();
  const isCommandOverlayOpen = useCommandOverlayOpen();
  const isGlobalSearchOpen = useGlobalSearchOpen();
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
  const isEditingKnowledgeBase =
    mainChatRuntime?.activeRun?.editingMode === true;
  const { statusClass, statusText, statusDetail } = resolveTopNavStatus(
    state,
    isMainChatRunning,
  );
  const currentWorker = resolveCurrentWorkerSummary(state);
  const voiceEnabled = isVoiceEnabled();
  const voiceModeAvailable = voiceEnabled && currentWorker?.type === "agent";
  const showMuteControl = voiceEnabled && (voiceModeAvailable || ui.audioMuted);
  const debugPanelEnabled = isDebugPanelEnabled();
  const showTerminalButton = isCoderAgent(currentWorker);
  const showProjectButton = isCoderAgent(currentWorker) || isDedicatedKbaseWorker(currentWorker);
  const currentWorkerTerminalStatus = showTerminalButton
    ? terminalAgentStatuses.get(currentWorker?.sourceId || "")
    : undefined;
  const isCurrentWorkerTerminalActive = Boolean(currentWorkerTerminalStatus);
  const isCurrentWorkerTerminalBusy = currentWorkerTerminalStatus === "busy";
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
    !voiceModeAvailable || isMainChatRunning || Boolean(state.activeFrontendTool);
  const usageSnapshot = state.usageSnapshot;
  const compactUsage = resolveLatestCompactUsage(state.events);
  const showUsageControl =
    Boolean(usageSnapshot) || Boolean(compactUsage) || isMainChatRunning;
  const usageTotal = resolveDisplayTotal(usageSnapshot);
  const {
    submitCompactCommand,
    submittingCommand,
  } = useBackgroundCommandActions({
    dispatch,
    state: {
      chatId: state.chatId,
      events: state.events,
      usageSnapshot: state.usageSnapshot,
    },
    text: {
      remember: {
        pending: t("composer.background.remember.pending"),
        error: t("composer.background.remember.error"),
      },
      learn: {
        pending: t("composer.background.learn.pending"),
        error: t("composer.background.learn.error"),
      },
      compact: {
        pending: t("composer.background.compact.pending"),
        error: t("composer.background.compact.error"),
      },
    },
  });
  const compactStatusOverlayPending =
    state.commandStatusOverlay.visible &&
    state.commandStatusOverlay.commandType === "compact" &&
    state.commandStatusOverlay.phase === "pending";
  const compactDisabled =
    !String(state.chatId || "").trim() ||
    isMainChatRunning ||
    isCommandOverlayOpen ||
    submittingCommand === "compact" ||
    compactStatusOverlayPending;
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

  const handleUsagePopoverOpenChange = React.useCallback((open: boolean) => {
    dispatch({ type: "SET_USAGE_POPOVER_OPEN", open });
  }, [dispatch]);

  const handleCloseUsagePopover = React.useCallback(() => {
    dispatch({ type: "SET_USAGE_POPOVER_OPEN", open: false });
  }, [dispatch]);

  React.useEffect(() => {
    if (isAnyOverlayOpen || isCommandOverlayOpen || isGlobalSearchOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest(".modal, .ant-modal")) {
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
    isCommandOverlayOpen,
    isMacPlatform,
  ]);

  const toggleRightSidebar = (tab: RightSidebarTabKey) => {
    if (surface !== "root") {
      if (!state.chatId) return;
      openTarget({
        version: 1,
        kind: tab === "debug" ? "debug" : "summary",
        chatId: state.chatId,
        runId: state.runId || undefined,
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
  const contextPercent = resolveContextPercent(usageSnapshot);
  const estimatedCostLabel = formatChatEstimatedCost(
    resolveChatEstimatedCost(usageSnapshot), locale,
  );
  const reasoningEffort = usageSnapshot?.contextWindow?.reasoningEffort || '';
  const reasoningEffortLabel = reasoningEffort
    ? tOrFallback(`composer.query.reasoning.${reasoningEffort}`, reasoningEffort)
    : '';
  const statusLabel = t(statusText);
  const statusTitle = statusDetail ? `${statusLabel}: ${statusDetail}` : statusLabel;
  return (
    <nav className={TOP_NAV_CLASS}>
      <div className={TOP_NAV_INNER_CLASS}>
        <div className={NAV_LEFT_CLASS}></div>

        <div className={NAV_CENTER_CLASS}>
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
            {isEditingKnowledgeBase ? (
              <span
                className={KBASE_EDITING_BADGE_CLASS}
                aria-label={t("topNav.status.editingKnowledgeBase")}
              >
                {t("topNav.status.editingKnowledgeBase")}
              </span>
            ) : null}
            {showUsageControl ? (
              <Popover
                open={state.usagePopoverOpen}
                trigger="click"
                placement="bottomRight"
                arrow={false}
                classNames={{ root: USAGE_POPOVER_ROOT_CLASS }}
                onOpenChange={handleUsagePopoverOpenChange}
                content={
                  <div
                    role="dialog"
                    aria-label={t("topNav.usage.title")}
                  >
                    <Flex gap={10} align="center">
                      <div
                        className={USAGE_CONTEXT_RING_CLASS}
                        style={
                          {
                            "--usage-context-percent": `${contextPercent?.progress ?? 0}%`,
                          } as React.CSSProperties
                        }
                        aria-label={t("topNav.usage.contextWindow")}
                      >
                        <span>{contextPercent == null ? "--%" : `${contextPercent.label}%`}</span>
                      </div>
                      <Flex vertical style={{ flex: 1, overflow: "hidden" }}>
                        <div className={USAGE_POPOVER_HEADER_CLASS}>
                          <Flex
                            gap={4}
                            align="center"
                            style={{ overflow: "hidden", whiteSpace: "nowrap" }}
                          >
                            <Typography.Text
                              ellipsis={{ tooltip: usageSnapshot?.contextWindow?.modelKey || usageSnapshot?.model?.key }}
                            >
                              {usageSnapshot?.contextWindow?.modelKey ||
                                usageSnapshot?.model?.key ||
                                t("topNav.usage.modelUnknown")}
                            </Typography.Text>
                            {reasoningEffortLabel ? (
                              <span style={{ color: "var(--ink-muted)" }}>
                                · {reasoningEffortLabel}
                              </span>
                            ) : null}
                          </Flex>
                          <Flex align="center" gap={8}>
                            <div
                              className={USAGE_CACHE_HIT_INLINE_CLASS}
                              aria-label={t("topNav.usage.totalCost")}
                            >
                              <span>{t("topNav.usage.totalCost")}:</span>
                              <strong>{estimatedCostLabel}</strong>
                            </div>
                            <UiButton
                              className={USAGE_POPOVER_CLOSE_CLASS}
                              variant="ghost"
                              size="sm"
                              iconOnly
                              aria-label={t("topNav.usage.close")}
                              title={t("topNav.usage.close")}
                              onClick={handleCloseUsagePopover}
                            >
                              <MaterialIcon name="close" />
                            </UiButton>
                          </Flex>
                        </div>
                        <UsageContextWindow
                          compactDisabled={compactDisabled}
                          onCompact={submitCompactCommand}
                          snapshot={usageSnapshot}
                          t={t}
                        />
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
                          showFirstTokenLatency
                          showOutputSpeed
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
                          showFirstTokenLatency
                          showOutputSpeed
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
                          showFirstTokenLatency
                          showOutputSpeed
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
                }
              >
                <UiButton
                  className={USAGE_TRIGGER_CLASS}
                  variant="ghost"
                  size="sm"
                  active={state.usagePopoverOpen}
                  aria-label={t("topNav.usage.open")}
                  title={t("topNav.usage.open")}
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
              </Popover>
            ) : null}
          </div>
        </div>

        <div className={NAV_GROUP_CLASS}>
          {showProjectButton ? (
            <UiButton
              className={TOP_NAV_ICON_BUTTON_CLASS}
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={t("topNav.project.open")}
              title={t("topNav.project.open")}
              onClick={() => openTarget({
                version: 1,
                kind: "project",
                agentKey: currentWorker?.sourceId,
                chatId: state.chatId || undefined,
                runId: state.runId || undefined,
              })}
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
                name={conversation.inputMode === "voice" ? "call_end" : "call"}
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
              <MaterialIcon name={ui.audioMuted ? "volume_off" : "volume_up"} />
            </UiButton>
          ) : null}
          <Divider type="vertical" />
          {debugPanelEnabled ? (
            <UiButton
              className={TOP_NAV_DEBUG_BUTTON_CLASS}
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
          {showTerminalButton ? (
            <UiButton
              className={[
                TOP_NAV_ICON_BUTTON_CLASS,
                "current-worker-tool-terminal tw:relative",
                "ui-icon-hover-24",
                isCurrentWorkerTerminalActive ? "has-terminal" : "",
                isCurrentWorkerTerminalBusy ? "has-running-terminal" : "",
              ]
                .filter(Boolean)
                .join(" ")}
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
                surface === "root"
                  ? dispatch({ type: "SET_TERMINAL_DOCK_OPEN", open: !ui.terminalDockOpen })
                  : currentWorker
                    ? openTarget({ version: 1, kind: "terminal", agentKey: currentWorker.sourceId, terminalKey: "main" })
                    : undefined
              }
            >
              <MaterialIcon name="terminal" />
              {isCurrentWorkerTerminalActive ? (
                <span
                  className={[
                    "current-worker-terminal-dot tw:absolute tw:right-[5px] tw:top-[5px] tw:h-[7px] tw:w-[7px] tw:rounded-full tw:border tw:border-bg-elev-1 tw:bg-accent-electric-strong",
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
