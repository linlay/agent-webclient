import type { AgentEvent } from "@/app/state/types";
import type {
	EventCommand,
	EventProcessorState,
} from "@/features/transport/lib/streamEventProcessorTypes";
import { toText } from "@/shared/utils/eventUtils";
import {
	buildNextTaskItem,
	resolveTaskGroupIdForStart,
} from "@/features/tasks/lib/taskRuntime";
import { readTaskGroupId } from "@/features/tasks/lib/taskEventProtocol";

export function processTaskEvent(
	event: AgentEvent,
	state: EventProcessorState,
): EventCommand[] {
	const commands: EventCommand[] = [];
	const type = toText(event.type);

	if (type === "task.start") {
		const taskId = toText(event.taskId).trim();
		if (!taskId) return commands;
		const updatedAt = event.timestamp || Date.now();
		const existingTask = state.getTaskItem(taskId);
		const groupId = resolveTaskGroupIdForStart(event, state, existingTask);
		const nextTask = buildNextTaskItem({
			event,
			state,
			taskId,
			status: "running",
			updatedAt,
			existing: existingTask,
			groupId,
		});
		commands.push({ cmd: "SET_TASK_ITEM_META", taskId, task: nextTask });
		commands.push({ cmd: "ADD_ACTIVE_TASK_ID", taskId });
		commands.push({ cmd: "SET_PLAN_CURRENT_RUNNING_TASK_ID", taskId });
		commands.push({ cmd: "SET_PLAN_LAST_TOUCHED_TASK_ID", taskId });
		commands.push({
			cmd: "SET_PLAN_RUNTIME",
			taskId,
			runtime: { status: "running", updatedAt, error: "" },
		});
		return commands;
	}

	if (type === "task.complete" || type === "task.fail" || type === "task.cancel") {
		const taskId = toText(event.taskId).trim();
		if (!taskId) return commands;
		const status =
			type === "task.complete"
				? "completed"
				: type === "task.cancel"
					? "canceled"
					: "failed";
		const updatedAt = event.timestamp || Date.now();
		const existingTask = state.getTaskItem(taskId);
		const groupId =
			readTaskGroupId(event) || existingTask?.taskGroupId || `task_group_${taskId}`;
		const nextTask = buildNextTaskItem({
			event,
			state,
			taskId,
			status,
			updatedAt,
			existing: existingTask,
			groupId,
		});
		commands.push({ cmd: "SET_TASK_ITEM_META", taskId, task: nextTask });
		commands.push({ cmd: "REMOVE_ACTIVE_TASK_ID", taskId });
		commands.push({
			cmd: "SET_PLAN_RUNTIME",
			taskId,
			runtime: {
				status,
				updatedAt,
				error: type === "task.fail" && event.error ? String(event.error) : "",
			},
		});
		commands.push({ cmd: "SET_PLAN_LAST_TOUCHED_TASK_ID", taskId });
		if (state.currentRunningPlanTaskId === taskId) {
			commands.push({ cmd: "SET_PLAN_CURRENT_RUNNING_TASK_ID", taskId: "" });
		}
		return commands;
	}

	return commands;
}
