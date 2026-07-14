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
  "finishedAt",
  "completedAt",
  "timestamp",
  "expiresAt",
  "readAt",
  "answeredAt",
  "pushedAt",
  "lastRunAt",
  "archivedAt",
] as const;

type StructuredPlatformTimeField =
  (typeof STRUCTURED_PLATFORM_TIME_FIELDS)[number];

type PushTimeContract = {
  required?: readonly StructuredPlatformTimeField[];
  optional?: readonly StructuredPlatformTimeField[];
  summary?: PushTimeContract;
};

const NO_PUSH_TIME_FIELDS: readonly StructuredPlatformTimeField[] = [];

/**
 * WebSocket frame:"push" uses business-specific instants. Stream and replay
 * events intentionally remain outside this table and continue to use their
 * required envelope timestamp.
 */
export const DESKTOP_PUSH_TIME_CONTRACT: Record<string, PushTimeContract> = {
  connected: {},
  heartbeat: { required: ["timestamp"] },
  "auth.expiring": { required: ["expiresAt"] },
  "run.started": { required: ["startedAt"] },
  "run.finished": { required: ["finishedAt"] },
  "chat.created": { required: ["createdAt"] },
  "chat.updated": { required: ["updatedAt"] },
  "chat.unread": { required: ["createdAt"] },
  "chat.read": { required: ["readAt"] },
  "chat.read_all": {},
  "chat.deleted": {},
  "chat.renamed": {},
  "chat.archived": {},
  "archive.restored": {
    summary: {
      required: ["createdAt", "updatedAt", "lastRunAt", "archivedAt"],
      optional: ["readAt"],
    },
  },
  "archive.deleted": {},
  "catalog.updated": { required: ["updatedAt"] },
  "awaiting.asking": { required: ["createdAt"] },
  "awaiting.answered": { required: ["answeredAt"] },
  "resource.pushed": { required: ["pushedAt"] },
};

const LEGACY_DESKTOP_PUSH_TYPES = new Set(["chat.restored"]);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isStructuredPlatformTimeField(
  field: string,
): field is StructuredPlatformTimeField {
  return (STRUCTURED_PLATFORM_TIME_FIELDS as readonly string[]).includes(field);
}

function hasValidNestedPlatformTimeFields(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.every(hasValidNestedPlatformTimeFields);
  }
  if (!isObjectRecord(value)) {
    return true;
  }
  return Object.entries(value).every(([field, nestedValue]) => {
    if (
      isStructuredPlatformTimeField(field) &&
      nestedValue !== undefined &&
      !isEpochMillis(nestedValue)
    ) {
      return false;
    }
    return hasValidNestedPlatformTimeFields(nestedValue);
  });
}

function containsTimestampField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsTimestampField);
  }
  if (!isObjectRecord(value)) {
    return false;
  }
  return Object.entries(value).some(
    ([field, nestedValue]) =>
      field === "timestamp" || containsTimestampField(nestedValue),
  );
}

function hasValidPushTimeRecord(
  record: Record<string, unknown>,
  contract: PushTimeContract,
): boolean {
  const required = contract.required ?? NO_PUSH_TIME_FIELDS;
  const optional = contract.optional ?? NO_PUSH_TIME_FIELDS;
  const allowed = new Set([...required, ...optional]);

  for (const field of STRUCTURED_PLATFORM_TIME_FIELDS) {
    if (record[field] !== undefined && !allowed.has(field)) {
      return false;
    }
  }

  return required.every((field) => isEpochMillis(record[field]));
}

/**
 * Validates the Desktop WebSocket push-time wire contract after the frame has
 * been flattened into its event form. The original frame is also inspected so
 * a legacy timestamp hidden in data or payload cannot be masked by a
 * top-level compatibility field.
 */
export function hasValidDesktopPushTimeContract(input: {
  type: unknown;
  event: unknown;
  frame?: unknown;
}): boolean {
  const type = String(input.type || "").trim();
  if (!type || LEGACY_DESKTOP_PUSH_TYPES.has(type) || !isObjectRecord(input.event)) {
    return false;
  }

  const sources = input.frame === undefined
    ? [input.event]
    : [input.event, input.frame];
  if (!sources.every(hasValidNestedPlatformTimeFields)) {
    return false;
  }
  if (type !== "heartbeat" && sources.some(containsTimestampField)) {
    return false;
  }

  const contract = DESKTOP_PUSH_TIME_CONTRACT[type];
  if (!contract) {
    return true;
  }
  if (!hasValidPushTimeRecord(input.event, contract)) {
    return false;
  }

  if (!contract.summary) {
    return true;
  }
  const summary = input.event.summary;
  return isObjectRecord(summary) && hasValidPushTimeRecord(summary, contract.summary);
}

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
