import type { AIUsageStats } from "@/shared/contracts/agentEvents";
import {
  buildUsageMetrics,
  type UsageMetric,
} from "@/features/usage/lib/usageMetrics";

const t = (key: string) => key;
const findMetric = (metrics: UsageMetric[], key: string) =>
  metrics.find((metric) => metric.key === key);

describe("buildUsageMetrics percent projection", () => {
  it("derives ratios from matching bases", () => {
    const stats: AIUsageStats = {
      promptTokens: 6_000,
      completionTokens: 4_000,
      totalTokens: 10_000,
      promptTokensDetails: { cacheHitTokens: 1_500, cacheMissTokens: 4_500 },
      completionTokensDetails: { reasoningTokens: 800 },
    };

    const metrics = buildUsageMetrics(t, stats);

    expect(metrics.map((metric) => metric.key)).toEqual([
      "prompt",
      "completion",
      "reasoning",
      "cacheHit",
      "cacheMiss",
    ]);
    expect(findMetric(metrics, "prompt")?.baseLabel).toBe("topNav.usage.metric.total");
    expect(findMetric(metrics, "prompt")?.percent).toEqual({
      label: "60%",
      percent: 60,
      base: 10_000,
    });
    expect(findMetric(metrics, "completion")?.percent).toEqual({
      label: "40%",
      percent: 40,
      base: 10_000,
    });
    expect(findMetric(metrics, "reasoning")?.percent).toEqual({
      label: "20%",
      percent: 20,
      base: 4_000,
    });
    expect(findMetric(metrics, "cacheHit")?.percent).toEqual({
      label: "25%",
      percent: 25,
      base: 6_000,
    });
    expect(findMetric(metrics, "cacheMiss")?.percent).toEqual({
      label: "75%",
      percent: 75,
      base: 6_000,
    });
  });

  it("formats tiny and overflowing ratios with clamped bars", () => {
    const metrics = buildUsageMetrics(t, {
      promptTokens: 12_000,
      completionTokens: 10,
      totalTokens: 10_009,
    });

    expect(findMetric(metrics, "prompt")?.percent).toMatchObject({
      label: ">100%",
      percent: 100,
    });
    const completionPercent = findMetric(metrics, "completion")?.percent;
    expect(completionPercent?.label).toBe("<1%");
    expect(completionPercent?.percent).toBeCloseTo(0.0999, 3);
  });

  it("falls back to raw numbers when the base is unusable", () => {
    const metrics = buildUsageMetrics(t, {
      promptTokens: 1_200,
    });

    expect(findMetric(metrics, "prompt")?.percent).toBeNull();
    expect(findMetric(metrics, "prompt")?.value).toBe(1_200);
    expect(findMetric(metrics, "reasoning")?.baseLabel).toBe(
      "topNav.usage.metric.completion",
    );
    expect(findMetric(metrics, "cacheHit")?.baseLabel).toBe(
      "topNav.usage.metric.prompt",
    );
  });

  it("keeps percent null for missing values", () => {
    const metrics = buildUsageMetrics(t, undefined);

    expect(metrics).toHaveLength(5);
    metrics.forEach((metric) => {
      expect(metric.percent).toBeNull();
      expect(metric.value).toBeUndefined();
    });
  });
});
