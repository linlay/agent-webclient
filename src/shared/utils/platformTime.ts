export function isEpochMillis(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function readEpochMillis(value: unknown): number {
  return isEpochMillis(value) ? value : 0;
}

export function formatEpochMillisLocal(
  value?: number | null,
  locale?: string,
): string {
  const timestamp = readEpochMillis(value);
  if (timestamp <= 0) return "--";
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
