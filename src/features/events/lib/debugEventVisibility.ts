import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { isDeltaLogsEnabled } from "@/shared/config/featureFlags";

const hiddenDebugEvents = new WeakSet<AgentEvent>();
const deltaLogEventTypes = new Set([
  "content.start", "content.delta", "content.end",
  "reasoning.start", "reasoning.delta", "reasoning.end",
  "planning.start", "planning.delta", "planning.end",
  "tool.start", "tool.args", "tool.end", "tool.output",
  "action.start", "action.args", "action.end",
]);

export function markDebugEventHidden(event: AgentEvent): void {
  hiddenDebugEvents.add(event);
}

export function shouldDisplayDebugEvent(event: AgentEvent): boolean {
  if (hiddenDebugEvents.has(event)) return false;
  if (isDeltaLogsEnabled()) return true;
  return !deltaLogEventTypes.has(String(event.type || "").toLowerCase());
}
