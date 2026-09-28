import type { AIUsageStats } from "@/shared/contracts/agentEvents";

// Missing and invalid values remain unknown; never infer a cache miss or reasoning count.
const count = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

export function buildUsageComposition(stats?: AIUsageStats) {
  const total = count(stats?.totalTokens);
  const prompt = count(stats?.promptTokens);
  const completion = count(stats?.completionTokens);
  const reasoning = count(stats?.completionTokensDetails?.reasoningTokens);
  const output = completion !== undefined && reasoning !== undefined && reasoning <= completion
    ? completion - reasoning : undefined;
  const hit = count(stats?.promptTokensDetails?.cacheHitTokens);
  const miss = count(stats?.promptTokensDetails?.cacheMissTokens);
  return { total, prompt, completion, reasoning, output, hit, miss };
}

export function compositionPercent(value: number | undefined, base: number | undefined) {
  if (value === undefined || base === undefined || base <= 0) return undefined;
  return value / base * 100;
}

export function compositionPercentLabel(percent: number | undefined) {
  if (percent === undefined) return undefined;
  if (percent > 100) return ">100%";
  if (percent > 0 && percent < 0.01) return "<0.01%";
  return `${Number(percent.toFixed(2))}%`;
}
