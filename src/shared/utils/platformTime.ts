export function isEpochMillis(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1_000_000_000_000 &&
    value <= Number.MAX_SAFE_INTEGER;
}

export function readEpochMillis(value: unknown): number | undefined {
  return isEpochMillis(value) ? value : undefined;
}

/**
 * Public agent-platform time-point fields that may occur on a stream event or
 * a push payload.  A present field must be an epoch-millisecond integer; the
 * caller decides separately which fields are required for a particular frame.
 */
export const STRUCTURED_PLATFORM_TIME_FIELDS = [
  "createdAt",
  "updatedAt",
  "startedAt",
  "completedAt",
  "timestamp",
  "expiresAt",
  "readAt",
] as const;

export function hasValidPresentPlatformTimeFields(value: unknown): boolean {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return STRUCTURED_PLATFORM_TIME_FIELDS.every(
    (field) => record[field] === undefined || isEpochMillis(record[field]),
  );
}

/**
 * Stream/replay events always require their own timestamp.  Do not infer it
 * from createdAt or updatedAt: that would silently alter a malformed wire
 * payload while rebuilding local state.
 */
export function readRequiredPlatformEventTimestamp(value: unknown): number | undefined {
  if (!hasValidPresentPlatformTimeFields(value)) {
    return undefined;
  }
  return readEpochMillis((value as Record<string, unknown>).timestamp);
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
