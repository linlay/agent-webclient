import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { ApiError } from "@/shared/data";
import { toRunOwner, type RunOwner } from "@/shared/data/runOwner";
import type { ReplayState } from "./conversationReplay";
import { RealtimeTransportError } from "@/features/transport/contracts/realtimeTransportErrors";

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function eventSeq(event: AgentEvent): number {
  const seq = Number((event as Record<string, unknown>).seq ?? 0);
  return Number.isFinite(seq) && seq >= 0 ? seq : 0;
}

export function shouldReloadChatSurfaceOnLifecycle(
  previousActive: boolean | null,
  nextActive: boolean,
): boolean {
  return previousActive === false && nextActive;
}

export function classifyChatSurfaceEvent(input: {
  event: AgentEvent;
  chatId: string;
  runId: string;
  lastSeq: number;
}): { action: "apply" | "ignore" | "reload"; nextSeq: number } {
  const eventChatId = String(input.event.chatId || input.chatId).trim();
  const eventRunId = String(input.event.runId || input.runId).trim();
  const seq = eventSeq(input.event);
  if (eventChatId !== input.chatId || eventRunId !== input.runId) {
    return { action: "ignore", nextSeq: input.lastSeq };
  }
  if (seq && seq <= input.lastSeq) {
    return { action: "ignore", nextSeq: input.lastSeq };
  }
  if (seq && input.lastSeq && seq > input.lastSeq + 1) {
    return { action: "reload", nextSeq: input.lastSeq };
  }
  return { action: "apply", nextSeq: seq || input.lastSeq };
}

export function lastSeqForRun(events: AgentEvent[], runId: string): number {
  let lastSeq = 0;
  for (const event of events) {
    if (runId && String(event.runId || "").trim() !== runId) continue;
    lastSeq = Math.max(lastSeq, eventSeq(event));
  }
  return lastSeq;
}

export function normalizedSeq(value: unknown): number {
  const seq = Number(value);
  return Number.isFinite(seq) && seq >= 0 ? Math.floor(seq) : 0;
}

export function chatSurfaceReplayErrorCode(cause: unknown): string {
  if (cause instanceof RealtimeTransportError) return String(cause.code || "").trim();
  if (cause instanceof ApiError) {
    const directCode = typeof cause.code === "string" ? cause.code.trim() : "";
    if (directCode) return directCode;
    return String(cause.platformError?.code || "").trim();
  }
  const record = objectRecord(cause);
  const directCode = typeof record?.code === "string" ? record.code.trim() : "";
  if (directCode) return directCode;
  const platformError = objectRecord(record?.platformError);
  return typeof platformError?.code === "string" ? platformError.code.trim() : "";
}

export function decideChatSurfaceReplayRecovery(input: {
  cause: unknown;
  bindingKey: string;
  attemptedBindingKey: string;
}): { recover: boolean; attemptedBindingKey: string } {
  const code = chatSurfaceReplayErrorCode(input.cause);
  if (
    (code !== "seq_expired" && code !== "replay_required") ||
    input.attemptedBindingKey === input.bindingKey
  ) {
    return { recover: false, attemptedBindingKey: input.attemptedBindingKey };
  }
  return { recover: true, attemptedBindingKey: input.bindingKey };
}

export function cloneReplayState(state: ReplayState): ReplayState {
  return {
    ...state,
    timelineNodes: new Map(state.timelineNodes),
    timelineOrder: state.timelineOrder.slice(),
    contentNodeById: new Map(state.contentNodeById),
    reasoningNodeById: new Map(state.reasoningNodeById),
    toolNodeById: new Map(state.toolNodeById),
    toolStates: new Map(state.toolStates),
    chatAgentById: new Map(state.chatAgentById),
    runAgentById: new Map(state.runAgentById),
    pendingAwaitings: state.pendingAwaitings.slice(),
    events: state.events.slice(),
    debugEvents: state.debugEvents.slice(),
    debugLines: state.debugLines.slice(),
    artifacts: state.artifacts.slice(),
    fileChanges: state.fileChanges.slice(),
    planRuntimeByTaskId: new Map(state.planRuntimeByTaskId),
    taskItemsById: new Map(state.taskItemsById),
    activeTaskIds: new Set(state.activeTaskIds),
  };
}

export function resolveChatSurfaceOwner(
  chat: Record<string, unknown>,
  activeRun: Record<string, unknown> | null,
): RunOwner | null {
  const activeOrLegacyOwner = toRunOwner({
    teamId: activeRun?.teamId || chat.teamId,
    agentKey:
      activeRun?.agentKey ||
      chat.firstAgentKey ||
      chat.agentKey,
  });
  if (activeOrLegacyOwner) return activeOrLegacyOwner;

  // Platform chat details keep completed-run ownership in runs[] rather than
  // repeating it on the chat object. Runs are ordered newest first.
  const runs = Array.isArray(chat.runs) ? chat.runs : [];
  for (const candidate of runs) {
    const owner = toRunOwner(objectRecord(candidate));
    if (owner) return owner;
  }
  return null;
}
