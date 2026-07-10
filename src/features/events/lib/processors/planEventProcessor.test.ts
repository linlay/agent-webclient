import type { EventProcessorState } from "@/features/events/lib/eventProcessorTypes";
import { processPlanEvent } from "@/features/events/lib/processors/planEventProcessor";

function createProcessorState(planId = ""): EventProcessorState {
	return {
		getContentNodeId: () => undefined,
		getReasoningNodeId: () => undefined,
		getToolNodeId: () => undefined,
		getToolState: () => undefined,
		getTimelineNode: () => undefined,
		getNodeText: () => "",
		nextCounter: () => 0,
		peekCounter: () => 0,
		activeReasoningKey: "",
		chatId: "",
		runId: "",
		getTaskItem: () => undefined,
		getActiveTaskIds: () => [],
		getPlanId: () => planId || undefined,
	};
}

describe("processPlanEvent", () => {
	it("preserves task runtime when updating the current plan", () => {
		const commands = processPlanEvent(
			{
				type: "plan.update",
				planId: "plan_1",
				plan: [{ taskId: "task_1", description: "更新后的任务" }],
			},
			createProcessorState("plan_1"),
		);

		expect(commands).toEqual([
			{
				cmd: "SET_PLAN",
				plan: {
					planId: "plan_1",
					plan: [{ taskId: "task_1", description: "更新后的任务" }],
				},
				resetRuntime: false,
			},
		]);
	});

	it("requests a task runtime reset when a different plan replaces the current plan", () => {
		const commands = processPlanEvent(
			{
				type: "plan.create",
				planId: "plan_2",
				plan: [{ taskId: "task_2", description: "新任务" }],
			},
			createProcessorState("plan_1"),
		);

		expect(commands[0]).toMatchObject({
			cmd: "SET_PLAN",
			plan: { planId: "plan_2" },
			resetRuntime: true,
		});
	});
});
