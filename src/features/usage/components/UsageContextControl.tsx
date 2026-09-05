import React from "react";
import { Drawer, Dropdown, Flex, Popover, Typography } from "antd";
import type { MenuProps } from "antd";
import {
  useAppDispatch,
  useAppState,
  useOptionalAppContext,
} from "@/app/state/AppContext";
import type {
  AIUsageEstimatedCost,
  AIUsageSnapshotEvent,
  AIUsageStats,
  AppState,
} from "@/app/state/types";
import {
  resolveCurrentWorkerSummary,
  supportsActiveRunContextCompact,
} from "@/features/workers/lib/currentWorker";
import { resolveMainChatRuntime } from "@/features/runs/lib/runRuntimeState";
import { useBackgroundCommandActions } from "@/features/composer/hooks/useBackgroundCommandActions";
import type { CompactLevel } from "@/shared/data";
import { tOrFallback, useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { TextCountUp } from "@/shared/components/text-count-up";
import {
  buildUsageMetrics,
  formatChatEstimatedCost,
  formatCompactUsageNumber,
  formatFirstTokenLatency,
  formatOutputTokensPerSecond,
  formatUsageNumber,
  formatUsagePercent,
  hasUsageStatsData,
  resolveChatCacheHitPercent,
  resolveChatEstimatedCost,
  resolveContextPercent,
  resolveDisplayTotal,
  resolveFirstTokenLatency,
  resolveLatestCompactUsage,
  resolveOutputTokensPerSecond,
  readUsageNumber,
  type UsageHeaderStat,
  type UsageMetric,
} from "@/features/usage/lib/usageMetrics";
import styles from "./UsageContextControl.module.css";

const withModuleClass = (semanticClass: string, utilityClasses = "") =>
  `${semanticClass} ${styles[semanticClass]} ${utilityClasses}`.trim();

const USAGE_CONTEXT_WINDOW_CLASS =
  withModuleClass("usage-context-window", "tw:flex tw:flex-wrap tw:items-center tw:gap-1.5 tw:rounded-lg tw:bg-[color-mix(in_srgb,var(--accent-soft)_58%,transparent)] tw:px-1.5 tw:py-1");
const USAGE_CONTEXT_COPY_CLASS =
  withModuleClass("usage-context-copy", "tw:inline-flex tw:min-w-0 tw:flex-1 tw:flex-wrap tw:items-baseline tw:gap-2 tw:[&>small]:flex-none tw:[&>small]:text-[9px] tw:[&>small]:leading-[1.1] tw:[&>small]:text-ink-2 tw:[&>span]:flex-none tw:[&>span]:text-[9px] tw:[&>span]:leading-[1.1] tw:[&>span]:text-ink-muted tw:[&>strong]:flex-none tw:[&>strong]:[overflow-wrap:anywhere] tw:[&>strong]:font-code tw:[&>strong]:text-[10px] tw:[&>strong]:font-bold tw:[&>strong]:leading-[1.1]");
const USAGE_CONTEXT_COMPACT_BTN_CLASS =
  withModuleClass("usage-context-compact-btn", "tw:min-h-[18px] tw:flex-none tw:rounded-md tw:px-1.5 tw:py-0 tw:text-[9px] tw:leading-none");
const USAGE_CACHE_HIT_INLINE_CLASS =
  withModuleClass("usage-cache-hit-inline", "tw:inline-flex tw:min-w-max tw:items-baseline tw:gap-1 tw:whitespace-nowrap tw:text-[9px] tw:leading-[1.1] tw:text-ink-muted tw:[&>strong]:font-code tw:[&>strong]:text-[10px] tw:[&>strong]:font-bold tw:[&>strong]:leading-[1.1] tw:[&>strong]:text-ink-1");
const USAGE_TRIGGER_RING_CLASS =
  withModuleClass("usage-trigger-ring", "tw:grid tw:h-[26px] tw:w-[26px] tw:flex-none tw:place-items-center tw:rounded-full tw:bg-[radial-gradient(circle_at_center,var(--bg-elev-2)_0_46%,transparent_50%),conic-gradient(var(--accent-electric)_var(--usage-context-percent,0%),var(--line-soft)_0)] tw:[&>span]:font-code tw:[&>span]:text-[11px] tw:[&>span]:font-bold tw:[&>span]:leading-none tw:[&>span]:text-ink-1");
const USAGE_POPOVER_SECTION_CLASS =
  withModuleClass("usage-popover-section", "tw:mt-1.5 tw:[&_h3]:m-0 tw:[&_h3]:text-[11px] tw:[&_h3]:font-bold tw:[&_h3]:text-ink-2");
const USAGE_POPOVER_SECTION_TITLE_CLASS =
  withModuleClass("usage-popover-section-title", "tw:mb-[3px] tw:mr-1 tw:flex tw:items-center tw:justify-between tw:gap-2");
const USAGE_METRIC_GRID_CLASS =
  withModuleClass("usage-metric-grid", "tw:m-0 tw:grid tw:grid-cols-3 tw:gap-1");
const USAGE_METRIC_CLASS =
  withModuleClass("usage-metric", "tw:flex tw:min-w-0 tw:items-center tw:justify-between tw:gap-1 tw:rounded-[7px] tw:border tw:[border-color:color-mix(in_srgb,var(--line-soft)_72%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-elev)_68%,transparent)] tw:px-[5px] tw:py-[3px] tw:[&_dd]:m-0 tw:[&_dd]:[overflow-wrap:anywhere] tw:[&_dd]:font-code tw:[&_dd]:text-[10px] tw:[&_dd]:font-bold tw:[&_dd]:leading-[1.15] tw:[&_dd]:text-ink-1 tw:[&_dt]:m-0 tw:[&_dt]:overflow-hidden tw:[&_dt]:text-ellipsis tw:[&_dt]:whitespace-nowrap tw:[&_dt]:text-[9px] tw:[&_dt]:leading-[1.2] tw:[&_dt]:text-ink-muted");
const USAGE_SECTION_CALL_COUNTS_CLASS =
  withModuleClass("usage-section-call-counts", "tw:inline-flex tw:min-w-0 tw:flex-wrap tw:items-center tw:justify-end tw:gap-2");
const USAGE_SECTION_STAT_CLASS =
  withModuleClass("usage-section-stat", "tw:inline-flex tw:min-w-0 tw:items-center tw:gap-1 tw:whitespace-nowrap tw:text-[9px] tw:leading-none tw:text-ink-muted tw:[&>strong]:font-code tw:[&>strong]:text-[10px] tw:[&>strong]:font-bold tw:[&>strong]:leading-none tw:[&>strong]:text-ink-1");
const USAGE_TRIGGER_CLASS = withModuleClass("usage-trigger");
const USAGE_POPOVER_ROOT_CLASS = withModuleClass("usage-popover");
const USAGE_DRAWER_ROOT_CLASS = withModuleClass("usage-drawer");
const USAGE_CONTEXT_RING_CLASS =
  withModuleClass("usage-context-ring", "tw:grid tw:h-11 tw:w-11 tw:flex-none tw:place-items-center tw:rounded-full tw:bg-[radial-gradient(circle_at_center,var(--bg-elev-2)_0_54%,transparent_55%),conic-gradient(var(--accent-electric)_var(--usage-context-percent,0%),color-mix(in_srgb,var(--line-soft)_76%,transparent)_0)] tw:[&>span]:font-code tw:[&>span]:text-sm tw:[&>span]:font-bold tw:[&>span]:leading-none tw:[&>span]:text-ink-1");
const USAGE_POPOVER_HEADER_CLASS =
  withModuleClass("usage-popover-header", "tw:mb-1 tw:flex tw:items-center tw:justify-between tw:gap-3 tw:[&_span]:max-w-[340px] tw:[&_span]:overflow-hidden tw:[&_span]:text-ellipsis tw:[&_span]:whitespace-nowrap tw:[&_span]:text-[10px] tw:[&_span]:font-medium tw:[&_span]:leading-[1.15] tw:[&_span]:text-ink-muted tw:[&_strong]:text-[11px] tw:[&_strong]:leading-[1.15]");
const USAGE_POPOVER_CLOSE_CLASS =
  withModuleClass("usage-popover-close", "tw:h-5 tw:min-h-5 tw:w-5 tw:min-w-5 tw:rounded-[7px] tw:p-0");
const USAGE_POPOVER_COMPACT_QUERY = "(max-width: 620px)";

const UsageContextWindow: React.FC<{
  compactDisabled: boolean;
  onCompact: (level: CompactLevel) => void;
  snapshot: AIUsageSnapshotEvent | null;
  t: (key: string, values?: Record<string, string>) => string;
}> = ({ compactDisabled, onCompact, snapshot, t }) => {
  const cacheHitPercent = resolveChatCacheHitPercent(snapshot);
  const cacheHitLabel = formatUsagePercent(cacheHitPercent);
  const compactMenu: MenuProps = {
    items: [
      { key: "l1_tools", label: t("topNav.usage.compactTools") },
      { key: "summary", label: t("topNav.usage.compactSummary") },
    ],
    onClick: ({ key }) => onCompact(key as CompactLevel),
  };

  return (
    <div className={USAGE_CONTEXT_WINDOW_CLASS}>
      <div className={USAGE_CONTEXT_COPY_CLASS}>
        <span>{t("topNav.usage.contextWindow")}</span>
        <strong>
          {formatUsageNumber(snapshot?.contextWindow?.currentSize)}
          {" / "}
          {formatUsageNumber(snapshot?.contextWindow?.maxSize)}
        </strong>
        <Dropdown menu={compactMenu} trigger={["click"]} disabled={compactDisabled}>
          <UiButton
            className={USAGE_CONTEXT_COMPACT_BTN_CLASS}
            variant="ghost"
            size="sm"
            disabled={compactDisabled}
            aria-label={t("topNav.usage.compact")}
            title={t("topNav.usage.compact")}
          >
            {t("topNav.usage.compact")}
          </UiButton>
        </Dropdown>
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
    const firstTokenLatency = formatFirstTokenLatency(
      resolveFirstTokenLatency(stats),
    );
    if (firstTokenLatency) {
      headerStats.push({
        key: "firstTokenLatency",
        label: t("topNav.usage.metric.firstTokenLatency"),
        value: firstTokenLatency,
      });
    }
  }

  if (showOutputSpeed) {
    const outputSpeed = formatOutputTokensPerSecond(
      resolveOutputTokensPerSecond(stats),
    );
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
    if (
      count.key === "tool" &&
      readUsageNumber(value) == null &&
      hasUsageStatsData(stats)
    ) {
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

export const UsageContextControl: React.FC<{
  placement?: "bottom" | "bottomRight";
  presentation?: "popover" | "drawer";
}> = ({ placement, presentation = "popover" }) => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const appContext = useOptionalAppContext();
  const { t, locale } = useI18n();
  const mainChatRuntime = appContext
    ? resolveMainChatRuntime(
        appContext.stateRef,
        appContext.activeQuerySessionRequestIdRef,
        appContext.querySessionsRef,
      )
    : null;
  const isMainChatRunning = Boolean(mainChatRuntime?.running);
  const currentWorker = resolveCurrentWorkerSummary(state);
  const usageSnapshot = state.usageSnapshot;
  const compactUsage = resolveLatestCompactUsage(state.events);
  const showUsageControl =
    Boolean(usageSnapshot) || Boolean(compactUsage) || isMainChatRunning;
  const usageTotal = resolveDisplayTotal(usageSnapshot);
  const { submitCompactCommand, submittingCommand } =
    useBackgroundCommandActions({
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
          waiting: t("composer.background.compact.waiting"),
          compacting: t("composer.background.compact.compacting"),
          toolsCompacting: t("composer.background.compact.toolsCompacting"),
          summaryCompacting: t("composer.background.compact.summaryCompacting"),
        },
      },
    });
  const compactStatusOverlayPending =
    state.commandStatusOverlay.visible &&
    state.commandStatusOverlay.commandType === "compact" &&
    state.commandStatusOverlay.phase === "pending";
  const compactDisabled =
    !String(state.chatId || "").trim() ||
    (isMainChatRunning && !supportsActiveRunContextCompact(currentWorker)) ||
    submittingCommand === "compact" ||
    compactStatusOverlayPending;
  const contextPercent = resolveContextPercent(usageSnapshot);
  const estimatedCostLabel = formatChatEstimatedCost(
    resolveChatEstimatedCost(usageSnapshot),
    locale,
  );
  const reasoningEffort = usageSnapshot?.contextWindow?.reasoningEffort || "";
  const reasoningEffortLabel = reasoningEffort
    ? tOrFallback(
        `composer.query.reasoning.${reasoningEffort}`,
        reasoningEffort,
      )
    : "";

  const [isCompactViewport, setIsCompactViewport] = React.useState<boolean>(
    () =>
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(USAGE_POPOVER_COMPACT_QUERY).matches
        : false,
  );

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function")
      return;
    const mediaQuery = window.matchMedia(USAGE_POPOVER_COMPACT_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsCompactViewport(event.matches);
    };
    setIsCompactViewport(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const handleUsagePopoverOpenChange = React.useCallback(
    (open: boolean) => {
      dispatch({ type: "SET_USAGE_POPOVER_OPEN", open });
    },
    [dispatch],
  );

  const handleCloseUsagePopover = React.useCallback(() => {
    dispatch({ type: "SET_USAGE_POPOVER_OPEN", open: false });
  }, [dispatch]);

  if (!showUsageControl) {
    return null;
  }

  const detailContent = (
    <div role="dialog" aria-label={t("topNav.usage.title")}>
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
          <span>
            {contextPercent == null ? "--%" : `${contextPercent.label}%`}
          </span>
        </div>
        <Flex vertical style={{ flex: 1, overflow: "hidden" }}>
          <div className={USAGE_POPOVER_HEADER_CLASS}>
            <Flex
              gap={4}
              align="center"
              style={{ overflow: "hidden", whiteSpace: "nowrap" }}
            >
              <Typography.Text
                ellipsis={{
                  tooltip:
                    usageSnapshot?.contextWindow?.modelKey ||
                    usageSnapshot?.model?.key,
                }}
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
        metrics={buildUsageMetrics(t, usageSnapshot?.usage?.current)}
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
  );

  const triggerButton = (
    <UiButton
      className={USAGE_TRIGGER_CLASS}
      variant="ghost"
      size="sm"
      active={state.usagePopoverOpen}
      aria-label={t("topNav.usage.open")}
      title={t("topNav.usage.open")}
      onClick={
        presentation === "drawer"
          ? () => handleUsagePopoverOpenChange(true)
          : undefined
      }
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
  );

  if (presentation === "drawer") {
    return (
      <>
        {triggerButton}
        <Drawer
          open={state.usagePopoverOpen}
          placement="top"
          height="auto"
          closable={false}
          destroyOnHidden
          className={USAGE_DRAWER_ROOT_CLASS}
          onClose={handleCloseUsagePopover}
        >
          {detailContent}
        </Drawer>
      </>
    );
  }

  return (
    <Popover
      open={state.usagePopoverOpen}
      trigger="click"
      placement={placement ?? (isCompactViewport ? "bottom" : "bottomRight")}
      arrow={false}
      classNames={{ root: USAGE_POPOVER_ROOT_CLASS }}
      onOpenChange={handleUsagePopoverOpenChange}
      content={detailContent}
    >
      {triggerButton}
    </Popover>
  );
};
