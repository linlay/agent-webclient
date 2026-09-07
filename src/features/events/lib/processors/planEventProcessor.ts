import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type { PlanItem } from "@/features/plan/lib/planState";
import type {
	EventCommand,
	EventProcessorState,
} from "@/features/events/lib/eventProcessorTypes";
import { toText } from "@/shared/utils/eventUtils";

export function processPlanEvent(
	event: AgentEvent,
	state: EventProcessorState,
): EventCommand[] {
	const type = toText(event.type);
	if (
		(type !== "plan.create" && type !== "plan.update") ||
		!Array.isArray(event.plan)
	) {
		return [];
	}

	const nextPlanId = String(event.planId || "plan");
	return [
		{
			cmd: "SET_PLAN",
			plan: {
				planId: nextPlanId,
				plan: event.plan.map((item) => ({ ...item })) as PlanItem[],
			},
			resetRuntime: Boolean(
				state.getPlanId?.() && state.getPlanId?.() !== nextPlanId,
			),
		},
	];
}
