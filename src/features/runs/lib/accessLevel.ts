import type { QueryAccessLevel } from "@/shared/data";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type { ChatActiveRunSummary } from "@/features/chats/lib/chatState";
import { toText } from "@/shared/utils/eventUtils";

export interface RunAccessLevelSnapshot {
  runId: string;
  accessLevel: QueryAccessLevel;
  version: number;
}

function readAccessLevel(value: unknown): QueryAccessLevel | undefined {
  return value === "default" || value === "auto_approve" || value === "full_access"
    ? value : undefined;
}

function readVersion(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value : undefined;
}

function isMainRunEvent(event: AgentEvent, chatId = ""): boolean {
  return (!chatId || !event.chatId || toText(event.chatId) === chatId) &&
    !event.taskId && !event.subAgentKey && !event.btwId &&
    !["btw", "explain"].includes(toText(event.lane)) &&
    !["btw", "explain"].includes(toText(event.kind));
}

export function readRunAccessLevelEvent(event: AgentEvent): RunAccessLevelSnapshot | undefined {
  if (!isMainRunEvent(event)) return undefined;
  const type = toText(event.type);
  if (!["request.query", "run.start", "run.access_level.changed"].includes(type)) return undefined;
  const runId = toText(event.runId);
  const query = event.query && typeof event.query === "object"
    ? event.query as Record<string, unknown> : undefined;
  const accessLevel = readAccessLevel(event.accessLevel ?? (type === "request.query" ? query?.accessLevel : undefined));
  const version = type === "run.access_level.changed"
    ? readVersion(event.version) : readVersion(event.accessLevelVersion) ?? 1;
  if (!runId || !accessLevel || version === undefined) return undefined;
  return { runId, accessLevel, version };
}

export function mergeRunAccessLevel(
  current: RunAccessLevelSnapshot | undefined,
  next: RunAccessLevelSnapshot,
): RunAccessLevelSnapshot {
  return current?.runId === next.runId && current.version >= next.version ? current : next;
}

// Only server snapshots/events establish a Run's permission. Missing values do
// not imply default, and another Run or a child task cannot supply the fallback.
export function resolveRunAccessLevel(input: {
  chatId: string;
  runId?: string;
  activeRun?: ChatActiveRunSummary | null;
  events: AgentEvent[];
}): RunAccessLevelSnapshot | undefined {
  const chatId = toText(input.chatId);
  const events = input.events.filter(event => isMainRunEvent(event, chatId));
  const latestRunEvent = [...events].reverse().find(event =>
    ["request.query", "run.start"].includes(toText(event.type)) && toText(event.runId),
  );
  const runId = toText(input.runId) || toText(input.activeRun?.runId) || toText(latestRunEvent?.runId);
  if (!runId) return undefined;
  let snapshot: RunAccessLevelSnapshot | undefined;
  const activeLevel = readAccessLevel(input.activeRun?.accessLevel);
  if (toText(input.activeRun?.runId) === runId && activeLevel) {
    snapshot = { runId, accessLevel: activeLevel, version: readVersion(input.activeRun?.accessLevelVersion) ?? 1 };
  }
  for (const event of events) {
    const next = readRunAccessLevelEvent(event);
    if (next?.runId === runId) snapshot = mergeRunAccessLevel(snapshot, next);
  }
  return snapshot;
}
