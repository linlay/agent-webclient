import { isAwaitingAnswerStreamEvent, type AgentEvent } from "@/app/state/types";
import type {
	EventCommand,
	EventProcessorConfig,
	EventProcessorState,
} from "@/features/transport/lib/streamEventProcessorTypes";
import { processPlanEvent } from "@/features/plan/lib/planEventProcessor";
import { processTaskEvent } from "@/features/tasks/lib/taskEventProcessor";
import { toText } from "@/shared/utils/eventUtils";
import { processContentEvent } from "@/features/timeline/lib/eventProcessorContent";
import { processPlanningEvent } from "@/features/timeline/lib/eventProcessorPlanning";
import { processReasoningEvent } from "@/features/timeline/lib/eventProcessorReasoning";
import { processRunEvent } from "@/features/timeline/lib/eventProcessorRun";
import { processSourceEvent } from "@/features/timeline/lib/eventProcessorSource";
import { processToolEvent } from "@/features/timeline/lib/eventProcessorTool";

export type {
	EventCommand,
	EventProcessorConfig,
	EventProcessorState,
} from "@/features/transport/lib/streamEventProcessorTypes";

export function processStreamEvent(
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
