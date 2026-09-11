import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type { ChatActiveRunSummary } from "@/features/chats/lib/chatState";
import type { RunSession } from "@/features/runs/lib/runSession";
import { readExplicitEditingMode } from "@/features/events/lib/eventFields";
import { toText } from "@/shared/utils/eventUtils";

export { readExplicitEditingMode } from "@/features/events/lib/eventFields";

export function resolveRunEditingMode(input: {
  runId: string;
  session?: Pick<RunSession, "runId" | "editingMode"> | null;
  activeRun?: ChatActiveRunSummary | null;
  events?: AgentEvent[];
}): boolean | undefined {
  const runId = toText(input.runId);
  const sessionRunId = toText(input.session?.runId);
  if (
    typeof input.session?.editingMode === "boolean" &&
    (!runId || sessionRunId === runId)
  ) {
    return input.session.editingMode;
  }

  const activeRunId = toText(input.activeRun?.runId);
  const activeRunMode = readExplicitEditingMode(input.activeRun);
  if (
    activeRunMode !== undefined &&
    (!runId || activeRunId === runId)
  ) {
    return activeRunMode;
  }

  const events = Array.isArray(input.events) ? input.events : [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (
      toText(event.type) !== "request.query" ||
      !runId ||
      toText(event.runId) !== runId
    ) {
      continue;
    }
    const eventMode = readExplicitEditingMode(event);
    if (eventMode !== undefined) {
      return eventMode;
    }
  }

  return undefined;
}
