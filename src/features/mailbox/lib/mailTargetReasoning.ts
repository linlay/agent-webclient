import type { ChatDetailResponse } from "@/shared/data/api/dto/chats";
import { normalizeQueryReasoningEffort } from "@/shared/data/api/reasoningEffort";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function mailTargetReasoning(chat: ChatDetailResponse, runId?: string) {
  const events = (chat.events || []).map(record).filter(event =>
    (!event.chatId || event.chatId === chat.chatId) && !event.taskId && !event.subAgentKey && !event.btwId &&
    !["btw", "explain"].includes(String(event.lane)) && !["btw", "explain"].includes(String(event.kind)));
  const latest = [...events].reverse();
  const targetRun = runId || chat.activeRun?.runId || latest.find(event =>
    ["request.query", "run.start"].includes(String(event.type)) && event.runId)?.runId;
  if (!targetRun) return undefined;
  const runEvents = latest.filter(event => event.runId === targetRun);
  const usage = runEvents.find(event => event.type === "usage.snapshot");
  const actual = normalizeQueryReasoningEffort(record(usage?.contextWindow).reasoningEffort ||
    record(usage?.model).reasoningEffort || usage?.reasoningEffort);
  if (actual) return { effort: actual, source: "actual" as const };
  const query = runEvents.find(event => event.type === "request.query");
  const requested = normalizeQueryReasoningEffort(record(query?.model).reasoningEffort);
  return requested ? { effort: requested, source: "requested" as const } : undefined;
}
