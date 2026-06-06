import { isAwaitingAnswerStreamEvent, type AgentEvent } from "@/app/state/types";
import type {
  EventCommand,
  EventProcessorConfig,
  EventProcessorState,
} from "@/features/timeline/lib/eventProcessorTypes";
import { toText } from "@/shared/utils/eventUtils";
import { processRunEvent } from "@/features/timeline/lib/eventProcessorRun";
import { processContentEvent } from "@/features/timeline/lib/eventProcessorContent";
import { processReasoningEvent } from "@/features/timeline/lib/eventProcessorReasoning";
import { processPlanningEvent } from "@/features/timeline/lib/eventProcessorPlanning";
import { processToolEvent } from "@/features/timeline/lib/eventProcessorTool";
import { processPlanEvent } from "@/features/timeline/lib/eventProcessorPlan";

export type {
  EventCommand,
  EventProcessorConfig,
  EventProcessorState,
} from "@/features/timeline/lib/eventProcessorTypes";

export function processEvent(
  event: AgentEvent,
  state: EventProcessorState,
  config: EventProcessorConfig,
): EventCommand[] {
  const type = toText(event.type);

  if (
    type === "request.query" ||
    type === "request.steer" ||
    type === "run.start" ||
    type === "run.error" ||
    type === "run.complete" ||
    type === "run.cancel" ||
    type === "context.compact.complete" ||
    type === "context.compact.failed"
  ) {
    return processRunEvent(event, state, config);
  }

  if (
    type === "content.start" ||
    type === "content.delta" ||
    type === "content.end" ||
    type === "content.snapshot" ||
    isAwaitingAnswerStreamEvent(type)
  ) {
    return processContentEvent(event, state, config);
  }

  if (
    type === "reasoning.start" ||
    type === "reasoning.delta" ||
    type === "reasoning.end" ||
    type === "reasoning.snapshot"
  ) {
    return processReasoningEvent(event, state, config);
  }

  if (
    type === "planning.start" ||
    type === "planning.delta" ||
    type === "planning.end" ||
    type === "planning.snapshot"
  ) {
    return processPlanningEvent(event, state, config);
  }

  if (
    type === "tool.start" ||
    type === "tool.snapshot" ||
    type === "tool.args" ||
    type === "tool.result" ||
    type === "tool.end" ||
    type.startsWith("action.") ||
    type === "artifact.publish"
  ) {
    return processToolEvent(event, state);
  }

  if (
    type === "plan.create" ||
    type === "plan.update" ||
    type === "task.start" ||
    type === "task.complete" ||
    type === "task.fail" ||
    type === "task.cancel"
  ) {
    return processPlanEvent(event, state);
  }

  return [];
}
