import type { QueryModelOverride } from "@/shared/data";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { normalizeQueryReasoningEffort } from "@/shared/data/api/reasoningEffort";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";

export function normalizeRunModel(value: unknown): QueryModelOverride {
  const raw = record(value);
  const key = text(raw.key);
  const reasoningEffort = normalizeQueryReasoningEffort(raw.reasoningEffort);
  const serviceTier = text(raw.serviceTier).toUpperCase();
  return { ...(key ? { key } : {}), ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(serviceTier ? { serviceTier } : {}) };
}


// Only the latest root Run supplies history defaults. Child/BTW/other Chat
// events must never replace the main conversation's model selection.
export function resolveChatModel(events: AgentEvent[], chatId: string): QueryModelOverride | undefined {
  const roots = events.filter(event =>
    (!event.chatId || event.chatId === chatId) && !event.taskId && !event.subAgentKey && !event.btwId &&
    !["btw", "explain"].includes(text(event.lane)) && !["btw", "explain"].includes(text(event.kind)));
  const latest = [...roots].reverse();
  const runId = text(latest.find(event => ["request.query", "run.start"].includes(event.type) && event.runId)?.runId) ||
    text(latest.find(event => event.type === "usage.snapshot" && event.runId)?.runId);
  let requested: QueryModelOverride = {};
  let actual: QueryModelOverride = {};
  for (const event of roots) {
    if (runId && event.runId !== runId) continue;
    if (event.type === "request.query") {
      requested = normalizeRunModel(record(event.query).model);
    } else if (event.type === "usage.snapshot") {
      const model = record(event.model);
      const context = record(event.contextWindow);
      actual = normalizeRunModel({ key: model.key || context.modelKey || event.modelKey,
        reasoningEffort: context.reasoningEffort || model.reasoningEffort || event.reasoningEffort,
        serviceTier: model.serviceTier || context.serviceTier });
    }
  }
  const selected = { ...actual, ...requested };
  return selected.key ? { ...selected, serviceTier: selected.serviceTier || "STANDARD" } : undefined;
}
