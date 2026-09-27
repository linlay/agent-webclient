import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import { formatPlatformErrorForDisplay } from "@/shared/data/errors/platformError";

export function streamEndFailure(
  event: AgentEvent,
  existing?: TimelineNode,
): Partial<TimelineNode> {
  if (event.status !== "failed") return {};
  const display = formatPlatformErrorForDisplay(event);
  const startedAt = existing?.startedAt ??
    (typeof event.startedAt === "number" ? event.startedAt : undefined);
  const endedAt = event.timestamp;
  return {
    status: "failed",
    errorDetail: display.error,
    startedAt,
    endedAt,
    durationMs: typeof startedAt === "number" && typeof endedAt === "number"
      ? Math.max(0, endedAt - startedAt)
      : undefined,
  };
}
