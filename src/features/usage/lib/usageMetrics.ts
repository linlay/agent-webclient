import type {
  AIUsageEstimatedCost,
  AIUsageSnapshotEvent,
  AIUsageStats,
  AppState,
} from "@/app/state/types";

export interface UsageMetric {
  key: string;
  label: string;
  value: unknown;
}

export interface UsageHeaderStat {
  key: string;
  label: string;
  value: string;
}

export interface UsageContextPercent {
  label: string;
  progress: number;
}

export function readUsageNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function formatUsageNumber(value: unknown): string {
  const numberValue = readUsageNumber(value);
  return numberValue == null ? "-" : numberValue.toLocaleString();
}

function readUsageTimingNumber(value: unknown): number | null {
  if (value == null) return null;
  const numberValue = readUsageNumber(value);
  return numberValue == null || numberValue < 0 ? null : numberValue;
}

export function formatFirstTokenLatency(value: unknown): string | null {
  const latencyMs = readUsageTimingNumber(value);
  if (latencyMs == null) return null;
  if (latencyMs < 1000) return `${Math.round(latencyMs)}ms`;
  return `${(latencyMs / 1000).toFixed(1)}s`;
}

export function resolveFirstTokenLatency(stats?: AIUsageStats): number | null {
  const directLatency = readUsageTimingNumber(stats?.timing?.firstTokenLatencyMs);
  if (directLatency != null) return directLatency;
  const totalLatency = readUsageTimingNumber(stats?.timing?.firstTokenLatencyTotalMs);
  const count = readUsageTimingNumber(stats?.timing?.firstTokenLatencyCount);
  if (totalLatency == null || totalLatency <= 0 || count == null || count <= 0) return null;
  return totalLatency / count;
}

export function formatOutputTokensPerSecond(value: unknown): string | null {
  const tokensPerSecond = readUsageTimingNumber(value);
  return tokensPerSecond == null ? null : `${tokensPerSecond.toFixed(1)}/s`;
}

export function resolveOutputTokensPerSecond(stats?: AIUsageStats): number | null {
  const completionTokens = readUsageTimingNumber(stats?.completionTokens);
  const generationDurationMs = readUsageTimingNumber(stats?.timing?.generationDurationMs);
  if (completionTokens == null || completionTokens <= 0 || generationDurationMs == null || generationDurationMs <= 0) {
    return null;
  }
  return (completionTokens * 1000) / generationDurationMs;
}

export function formatCompactUsageNumber(value: unknown): string {
  const numberValue = readUsageNumber(value);
  if (numberValue == null) return "-";
  if (numberValue >= 1_000_000) return `${(numberValue / 1_000_000).toFixed(1)}M`;
  if (numberValue >= 1_000) return `${(numberValue / 1_000).toFixed(1)}K`;
  return numberValue.toLocaleString();
}

export function formatChatEstimatedCost(
  cost?: AIUsageEstimatedCost,
  locale: string = "zh-CN",
): string {
  const total = readUsageNumber(cost?.total);
  if (total == null || total < 0) return "--";
  const currency = cost?.currency?.toUpperCase();
  if (currency === "USD") {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currencyDisplay: "symbol",
      currency: "USD",
    }).format(total);
  }
  if (currency === "CNY" || currency === "RMB" || currency === "CNH") {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currencyDisplay: "symbol",
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

export function resolveDisplayTotal(snapshot: AIUsageSnapshotEvent | null): number | null {
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

export function hasUsageStatsData(stats?: AIUsageStats): boolean {
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
  return numericValues.some((value) => readUsageNumber(value) != null) || Boolean(stats.estimatedCost);
}

export function buildUsageMetrics(
  t: (key: string) => string,
  stats?: AIUsageStats,
): UsageMetric[] {
  return [
    { key: "prompt", label: t("topNav.usage.metric.prompt"), value: stats?.promptTokens },
    { key: "completion", label: t("topNav.usage.metric.completion"), value: stats?.completionTokens },
    { key: "total", label: t("topNav.usage.metric.total"), value: stats?.totalTokens },
    { key: "reasoning", label: t("topNav.usage.metric.reasoning"), value: getReasoningTokens(stats) },
    { key: "cacheHit", label: t("topNav.usage.metric.cacheHit"), value: getCacheHitTokens(stats) },
    { key: "cacheMiss", label: t("topNav.usage.metric.cacheMiss"), value: getCacheMissTokens(stats) },
  ];
}

export function resolveLatestCompactUsage(events: AppState["events"]): AIUsageStats | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index] as Record<string, unknown>;
    if (event.type !== "context.compact.complete") continue;
    const usage = event.compactionUsage;
    return usage && typeof usage === "object" ? usage as AIUsageStats : null;
  }
  return null;
}

export function resolveContextPercent(snapshot: AIUsageSnapshotEvent | null): UsageContextPercent | null {
  const currentSize = readUsageNumber(snapshot?.contextWindow?.currentSize);
  const maxSize = readUsageNumber(snapshot?.contextWindow?.maxSize);
  if (currentSize == null || maxSize == null || maxSize <= 0) return null;
  const percent = Math.max(0, Math.round((currentSize / maxSize) * 100));
  return { label: percent > 999 ? ">999" : `${percent}`, progress: Math.min(100, percent) };
}

export function resolveChatCacheHitPercent(snapshot: AIUsageSnapshotEvent | null): number | null {
  const promptDetails = snapshot?.usage?.chat?.promptTokensDetails;
  const hitTokens = readUsageNumber(promptDetails?.cacheHitTokens);
  const missTokens = readUsageNumber(promptDetails?.cacheMissTokens);
  if (hitTokens == null || missTokens == null) return null;
  const totalTokens = hitTokens + missTokens;
  if (totalTokens <= 0) return null;
  return Math.max(0, Math.min(100, (hitTokens / totalTokens) * 100));
}

export function formatUsagePercent(value: number | null): string {
  return value == null ? "--%" : `${value.toFixed(2)}%`;
}

export function resolveChatEstimatedCost(
  snapshot: AIUsageSnapshotEvent | null,
): AIUsageEstimatedCost | undefined {
  return snapshot?.usage?.chat?.estimatedCost;
}
