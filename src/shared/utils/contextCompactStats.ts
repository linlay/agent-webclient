interface CompactStats {
  scope?: string;
  estimatedTokens?: unknown;
  currentTokens?: unknown;
}

function readNumber(value: unknown): number | null {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function formatCompactStats(
  data: CompactStats,
  t: (key: string, params?: Record<string, unknown>) => string,
): string[] {
  const before = readNumber(data.estimatedTokens);
  const after = readNumber(data.currentTokens);
  const parts: string[] = [];
  const tokens = (value: number) => Math.round(value).toLocaleString("en-US");
  if (before != null && before > 0 && after != null) {
    const freed = Math.max(0, before - after);
    parts.push(t("contextCompact.reductionTokens", {
      released: (freed / before * 100).toFixed(2),
      tokens: tokens(freed),
    }));
  }
  if (after != null) {
    parts.push(t(data.scope === "history" ? "contextCompact.historyTokens" : "contextCompact.currentTokens", {
      tokens: tokens(after),
    }));
  }
  return parts;
}
