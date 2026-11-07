import type { ChatDetailResponse } from "@/shared/data/api/dto/chats";
import { normalizeQueryReasoningEffort } from "@/shared/data/api/reasoningEffort";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function targetRunEvents(chat: ChatDetailResponse, runId?: string) {
  const events = (chat.events || []).map(record).filter(event =>
    (!event.chatId || event.chatId === chat.chatId) && !event.taskId && !event.subAgentKey && !event.btwId &&
    !["btw", "explain"].includes(String(event.lane)) && !["btw", "explain"].includes(String(event.kind)));
  const latest = [...events].reverse();
  const targetRun = runId || chat.activeRun?.runId || latest.find(event =>
    ["request.query", "run.start"].includes(String(event.type)) && event.runId)?.runId;
  return targetRun ? latest.filter(event => event.runId === targetRun) : [];
}

export function mailTargetReasoning(chat: ChatDetailResponse, runId?: string) {
  const runEvents = targetRunEvents(chat, runId);
  const usage = runEvents.find(event => event.type === "usage.snapshot");
  const actual = normalizeQueryReasoningEffort(record(usage?.contextWindow).reasoningEffort ||
    record(usage?.model).reasoningEffort || usage?.reasoningEffort);
  if (actual) return { effort: actual, source: "actual" as const };
  const query = runEvents.find(event => event.type === "request.query");
  const requested = normalizeQueryReasoningEffort(record(query?.model).reasoningEffort);
  return requested ? { effort: requested, source: "requested" as const } : undefined;
}

export function mailTargetModel(chat: ChatDetailResponse, runId?: string) {
  const events = targetRunEvents(chat, runId);
  const usage = events.find(event => event.type === "usage.snapshot");
  const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const actual = text(record(usage?.contextWindow).modelKey) || text(record(usage?.model).key);
  if (actual) return { model: actual, source: "actual" as const };
  const query = events.find(event => event.type === "request.query");
  const model = record(query?.model);
  const requested = text(model.key) || text(model.modelId);
  return requested ? { model: requested, source: "requested" as const } : undefined;
}
