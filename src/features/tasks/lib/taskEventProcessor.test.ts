import type { TaskItemMeta } from "@/app/state/types";
import type { EventProcessorState } from "@/features/transport/lib/streamEventProcessorTypes";
import { processTaskEvent } from "@/features/tasks/lib/taskEventProcessor";

function createProcessorState(input: {
	runId?: string;
	currentRunningTaskId?: string;
	tasks?: Map<string, TaskItemMeta>;
	activeTaskIds?: string[];
	getPlanTaskDescription?: (taskId: string) => string | undefined;
} = {}): EventProcessorState {
	const tasks = input.tasks || new Map<string, TaskItemMeta>();
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
		runId: input.runId || "run_default",
		currentRunningPlanTaskId: input.currentRunningTaskId,
		getTaskItem: (taskId) => tasks.get(taskId),
		getActiveTaskIds: () => input.activeTaskIds || [],
		getPlanTaskDescription: input.getPlanTaskDescription,
		getPlanId: () => undefined,
	};
}

describe("processTaskEvent", () => {
	it("creates runtime metadata for a task event without a plan", () => {
		const commands = processTaskEvent(
			{
				type: "task.start",
				taskId: "task_1",
				taskName: "独立任务",
				runId: "run_1",
				timestamp: 100,
			},
			createProcessorState(),
		);

		expect(commands).toEqual([
			expect.objectContaining({
				cmd: "SET_TASK_ITEM_META",
				taskId: "task_1",
				task: expect.objectContaining({
					taskName: "独立任务",
					taskGroupId: "task_group_task_1",
					status: "running",
					runId: "run_1",
				}),
			}),
			{ cmd: "ADD_ACTIVE_TASK_ID", taskId: "task_1" },
			{ cmd: "SET_PLAN_CURRENT_RUNNING_TASK_ID", taskId: "task_1" },
			{ cmd: "SET_PLAN_LAST_TOUCHED_TASK_ID", taskId: "task_1" },
			{
				cmd: "SET_PLAN_RUNTIME",
				taskId: "task_1",
				runtime: { status: "running", updatedAt: 100, error: "" },
			},
		]);
	});

	it("finishes a running task and clears the active task projection", () => {
		const runningTask: TaskItemMeta = {
			taskId: "task_1",
			taskName: "任务一",
			taskGroupId: "group_1",
			runId: "run_1",
			status: "running",
			startedAt: 100,
			updatedAt: 100,
			error: "",
		};
		const commands = processTaskEvent(
			{
				type: "task.fail",
				taskId: "task_1",
				timestamp: 250,
				error: "worker unavailable",
			},
			createProcessorState({
				currentRunningTaskId: "task_1",
				tasks: new Map([["task_1", runningTask]]),
				activeTaskIds: ["task_1"],
			}),
		);

		expect(commands).toEqual([
			expect.objectContaining({
				cmd: "SET_TASK_ITEM_META",
				taskId: "task_1",
				task: expect.objectContaining({
					status: "failed",
					endedAt: 250,
					durationMs: 150,
					error: "worker unavailable",
				}),
			}),
			{ cmd: "REMOVE_ACTIVE_TASK_ID", taskId: "task_1" },
			{
				cmd: "SET_PLAN_RUNTIME",
				taskId: "task_1",
				runtime: {
					status: "failed",
					updatedAt: 250,
					error: "worker unavailable",
				},
			},
			{ cmd: "SET_PLAN_LAST_TOUCHED_TASK_ID", taskId: "task_1" },
			{ cmd: "SET_PLAN_CURRENT_RUNNING_TASK_ID", taskId: "" },
		]);
	});
});
