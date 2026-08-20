export const CONVERSATION_SNAPSHOT_VERSION = 1 as const;
export const MAX_CONVERSATION_SNAPSHOT_BYTES = 20 * 1024 * 1024;

const MAX_SNAPSHOT_ITEMS = 2_000;
const MAX_TITLE_BYTES = 300;
const MAX_LABEL_BYTES = 300;
const UTF8_ENCODER = new TextEncoder();

export type ConversationSnapshotOutcome =
  | "running"
  | "completed"
  | "cancelled"
  | "failed";

export type ConversationSnapshotUserItemV1 = Readonly<{
  kind: "user";
  text: string;
  at: number;
}>;

export type ConversationSnapshotAssistantItemV1 = Readonly<
  | { kind: "reasoning"; text: string; label?: string; at: number }
  | { kind: "assistant"; text: string; at: number }
>;

export type ConversationSnapshotTurnV1 = Readonly<{
  startedAt: number;
  endedAt?: number;
  outcome: ConversationSnapshotOutcome;
  items: readonly [
    ConversationSnapshotUserItemV1,
    ...ConversationSnapshotAssistantItemV1[],
  ];
}>;

export type ConversationSnapshotV1 = Readonly<{
  version: 1;
  title: string;
  createdAt: number;
  capturedAt: number;
  turns: readonly ConversationSnapshotTurnV1[];
}>;

export function parseConversationSnapshot(
  value: string,
): ConversationSnapshotV1 | null {
  if (!value || utf8Bytes(value) > MAX_CONVERSATION_SNAPSHOT_BYTES) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    return null;
  }
  if (
    !isRecord(decoded) ||
    !hasExactKeys(decoded, ["version", "title", "createdAt", "capturedAt", "turns"]) ||
    decoded.version !== CONVERSATION_SNAPSHOT_VERSION ||
    !isValidTrimmedText(decoded.title, MAX_TITLE_BYTES) ||
    !isEpochMilliseconds(decoded.createdAt) ||
    !isEpochMilliseconds(decoded.capturedAt) ||
    decoded.capturedAt < decoded.createdAt ||
    !Array.isArray(decoded.turns)
  ) {
    return null;
  }

  let itemCount = 0;
  let previousTurnStartedAt = 0;
  const turns: ConversationSnapshotTurnV1[] = [];
  for (const candidate of decoded.turns) {
    const turn = parseTurn(candidate);
    if (!turn || turn.startedAt < previousTurnStartedAt) return null;
    itemCount += turn.items.length;
    if (itemCount > MAX_SNAPSHOT_ITEMS) return null;
    turns.push(turn);
    previousTurnStartedAt = turn.startedAt;
  }

  return {
    version: CONVERSATION_SNAPSHOT_VERSION,
    title: decoded.title.trim(),
    createdAt: decoded.createdAt,
    capturedAt: decoded.capturedAt,
    turns,
  };
}

function parseTurn(value: unknown): ConversationSnapshotTurnV1 | null {
  if (!isRecord(value)) return null;
  const hasEndedAt = Object.hasOwn(value, "endedAt");
  const expectedKeys = hasEndedAt
    ? ["startedAt", "endedAt", "outcome", "items"]
    : ["startedAt", "outcome", "items"];
  if (
    !hasExactKeys(value, expectedKeys) ||
    !isEpochMilliseconds(value.startedAt) ||
    !isOutcome(value.outcome) ||
    !Array.isArray(value.items) ||
    value.items.length === 0 ||
    (value.outcome === "running" && hasEndedAt) ||
    (value.outcome !== "running" && !hasEndedAt) ||
    (hasEndedAt &&
      (!isEpochMilliseconds(value.endedAt) || value.endedAt < value.startedAt))
  ) {
    return null;
  }

  const user = parseUserItem(value.items[0]);
  if (!user) return null;
  const items: [
    ConversationSnapshotUserItemV1,
    ...ConversationSnapshotAssistantItemV1[],
  ] = [user];
  let previousItemAt = Math.max(user.at, value.startedAt);
  for (const candidate of value.items.slice(1)) {
    const item = parseAssistantItem(candidate);
    if (!item || item.at < previousItemAt) return null;
    items.push(item);
    previousItemAt = item.at;
  }
  if (hasEndedAt && previousItemAt > (value.endedAt as number)) return null;

  return {
    startedAt: value.startedAt,
    ...(hasEndedAt ? { endedAt: value.endedAt as number } : {}),
    outcome: value.outcome,
    items,
  };
}

function parseUserItem(value: unknown): ConversationSnapshotUserItemV1 | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["kind", "text", "at"]) ||
    value.kind !== "user" ||
    !isValidTrimmedText(value.text) ||
    !isEpochMilliseconds(value.at)
  ) {
    return null;
  }
  return { kind: "user", text: value.text, at: value.at };
}

function parseAssistantItem(
  value: unknown,
): ConversationSnapshotAssistantItemV1 | null {
  if (!isRecord(value) || !isValidTrimmedText(value.text) || !isEpochMilliseconds(value.at)) {
    return null;
  }
  if (
    value.kind === "assistant" &&
    hasExactKeys(value, ["kind", "text", "at"])
  ) {
    return { kind: "assistant", text: value.text, at: value.at };
  }
  if (
    value.kind !== "reasoning" ||
    !(hasExactKeys(value, ["kind", "text", "at"]) ||
      hasExactKeys(value, ["kind", "text", "label", "at"])) ||
    (Object.hasOwn(value, "label") &&
      !isValidTrimmedText(value.label, MAX_LABEL_BYTES))
  ) {
    return null;
  }
  return {
    kind: "reasoning",
    text: value.text,
    ...(typeof value.label === "string" ? { label: value.label.trim() } : {}),
    at: value.at,
  };
}

function isOutcome(value: unknown): value is ConversationSnapshotOutcome {
  return (
    value === "running" ||
    value === "completed" ||
    value === "cancelled" ||
    value === "failed"
  );
}

function isEpochMilliseconds(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1_000_000_000_000
  );
}

function isValidTrimmedText(value: unknown, maxBytes?: number): value is string {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    (maxBytes === undefined || utf8Bytes(value) <= maxBytes)
  );
}

function hasExactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(record);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function utf8Bytes(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}
