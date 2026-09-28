import { buildUsageComposition, compositionPercent, compositionPercentLabel } from "./usageComposition";

describe("usage composition", () => {
  it("splits output without double counting reasoning", () => {
    const result = buildUsageComposition({ promptTokens: 9700, completionTokens: 300,
      totalTokens: 10000, completionTokensDetails: { reasoningTokens: 54 } });
    expect(result.output).toBe(246);
    expect(compositionPercentLabel(compositionPercent(result.output, result.total))).toBe("2.46%");
    expect(compositionPercentLabel(compositionPercent(result.reasoning, result.total))).toBe("0.54%");
  });
  it("preserves missing details and rejects impossible output splits", () => {
    expect(buildUsageComposition({ completionTokens: 10 }).output).toBeUndefined();
    expect(buildUsageComposition({ completionTokens: 10, completionTokensDetails: { reasoningTokens: 20 } }).output).toBeUndefined();
    expect(buildUsageComposition().hit).toBeUndefined();
    expect(compositionPercent(0, 0)).toBeUndefined();
    expect(compositionPercentLabel(compositionPercent(0, 100))).toBe("0%");
  });
});
