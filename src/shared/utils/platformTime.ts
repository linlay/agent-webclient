export function isEpochMillis(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1_000_000_000_000 &&
    value <= Number.MAX_SAFE_INTEGER;
}

export function readEpochMillis(value: unknown): number | undefined {
  return isEpochMillis(value) ? value : undefined;
}

/** Internal sort sentinel only; never use this to populate a platform DTO. */
export function readEpochMillisOrZero(value: unknown): number {
  return readEpochMillis(value) ?? 0;
}

export function formatEpochMillisLocal(
  value?: number | null,
  locale?: string,
): string {
  const timestamp = readEpochMillis(value);
  if (timestamp === undefined) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString(locale);
}

export function formatPlatformReadableTime(
  value?: string | null,
): string {
  const text = String(value || "").trim();
  return text || "--";
}

export function formatPlatformReadableTimeWithFallback(
  readable?: string | null,
  fallbackEpochMillis?: number | null,
  locale?: string,
): string {
  const text = formatPlatformReadableTime(readable);
  return text !== "--" ? text : formatEpochMillisLocal(fallbackEpochMillis, locale);
}
