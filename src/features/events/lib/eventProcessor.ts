import { MODEL_RETRY_NODE_ID } from "@/shared/ui/modelRetry";
import { isAwaitingAnswerStreamEvent } from "@/shared/contracts/agentEvents";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type {
	EventCommand,
	EventProcessorConfig,
	EventProcessorState,
} from "@/features/events/lib/eventProcessorTypes";
import { processPlanEvent } from "@/features/events/lib/processors/planEventProcessor";
import { processTaskEvent } from "@/features/events/lib/processors/taskEventProcessor";
import { toText } from "@/shared/utils/eventUtils";
import { processContentEvent } from "@/features/events/lib/processors/eventProcessorContent";
import { processPlanningEvent } from "@/features/events/lib/processors/eventProcessorPlanning";
import { processReasoningEvent } from "@/features/events/lib/processors/eventProcessorReasoning";
import { processRunEvent } from "@/features/events/lib/processors/eventProcessorRun";
import { processSourceEvent } from "@/features/events/lib/processors/eventProcessorSource";
import { processToolEvent } from "@/features/events/lib/processors/eventProcessorTool";

export type {
	EventCommand,
	EventProcessorConfig,
	EventProcessorState,
} from "@/features/events/lib/eventProcessorTypes";

export function processStreamEvent(event: AgentEvent, state: EventProcessorState, config: EventProcessorConfig): EventCommand[] {
  const commands = routeStreamEvent(event, state, config);
  const current = state.getTimelineNode(MODEL_RETRY_NODE_ID);
  if (!current) return commands;
  const type = toText(event.type);
  const sameRun = !event.runId || event.runId === current.runId;
  const sameTask = toText(event.taskId) === toText(current.taskId);
  const terminal = ["run.complete", "run.cancel", "run.error"].includes(type);
  const resumed = (type === "run.activity" && event.phase === "model_call" && ["running", "completed"].includes(toText(event.status))) ||
    ["content.delta", "reasoning.delta", "tool.args"].includes(type);
  if (type === "run.start" || (sameRun && (terminal || (sameTask && resumed)))) {
    return [{cmd: "SET_MODEL_RETRY"}, ...commands];
  }
  return commands;
}

function routeStreamEvent(
	event: AgentEvent,
	state: EventProcessorState,
	config: EventProcessorConfig,
): EventCommand[] {
	const type = toText(event.type);

	if (
		type === "request.query" ||
		type === "request.steer" ||
		type === "run.start" ||
		type === "run.activity" ||
		type === "run.error" ||
		type === "run.complete" ||
		type === "run.cancel" ||
		type === "context.compact.start" ||
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
		return processContentEvent(event, state);
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
		type === "tool.output" ||
		type === "tool.result" ||
		type === "tool.end" ||
		type.startsWith("action.") ||
		type === "artifact.publish"
	) {
		return processToolEvent(event, state);
	}

	if (type === "source.publish") {
		return processSourceEvent(event, state);
	}

	if (type === "plan.create" || type === "plan.update") {
		return processPlanEvent(event, state);
	}

	if (
		type === "task.start" ||
		type === "task.complete" ||
		type === "task.fail" ||
		type === "task.cancel"
	) {
		return processTaskEvent(event, state);
	}

	return [];
}
