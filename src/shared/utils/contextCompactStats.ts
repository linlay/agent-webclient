interface CompactStats {
  scope?: string;
  preCompactEstimatedTokens?: unknown;
  postCompactEstimatedTokens?: unknown;
  compressionRatio?: unknown;
  remainingRatio?: unknown;
  releasedRatio?: unknown;
  tokensFreed?: unknown;
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
  const before = readNumber(data.preCompactEstimatedTokens);
  const after = readNumber(data.postCompactEstimatedTokens);
  const freed = before != null && after != null
    ? Math.max(0, before - after)
    : readNumber(data.tokensFreed);
  const remaining = readNumber(data.remainingRatio);
  const ratio = readNumber(data.compressionRatio);
  const released = readNumber(data.releasedRatio)
    ?? (before != null && before > 0 && freed != null ? freed / before * 100 : null)
    ?? (remaining != null ? 100 - remaining : null)
    ?? (ratio != null ? (1 - ratio) * 100 : null);
  const parts: string[] = [];
  const tokens = (value: number) => Math.round(value).toLocaleString("en-US");
  if (released != null) {
    parts.push(t(freed != null ? "contextCompact.reductionTokens" : "contextCompact.reduction", {
      released: Math.min(100, Math.max(0, released)).toFixed(2),
      tokens: freed == null ? "" : tokens(freed),
    }));
  } else if (freed != null) {
    parts.push(t("contextCompact.releasedTokens", { tokens: tokens(freed) }));
  }
  if (after != null) {
    parts.push(t(data.scope === "history" ? "contextCompact.historyTokens" : "contextCompact.currentTokens", {
      tokens: tokens(after),
    }));
  }
  return parts;
}
