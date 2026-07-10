import type { AgentEvent, TaskItemMeta } from "@/app/state/types";
import type { EventProcessorState } from "@/features/transport/lib/streamEventProcessorTypes";
import { toText } from "@/shared/utils/eventUtils";
import { readSubAgentKey, readTaskGroupId } from "@/features/tasks/lib/taskEventProtocol";

function computeTaskDurationMs(
	startedAt?: number,
	endedAt?: number,
): number | undefined {
	if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
		return undefined;
	}
	return Math.max(0, Number(endedAt) - Number(startedAt));
}

export function resolveTaskGroupIdForStart(
	event: AgentEvent,
	state: EventProcessorState,
	existingTask?: TaskItemMeta,
): string {
	const explicitGroupId = readTaskGroupId(event);
	if (explicitGroupId) {
		return explicitGroupId;
	}
	if (existingTask?.taskGroupId) {
		return existingTask.taskGroupId;
	}

	const activeGroupIds = Array.from(
		new Set(
			state
				.getActiveTaskIds()
				.map((taskId) => state.getTaskItem(taskId)?.taskGroupId || "")
				.filter(Boolean),
		),
	);
	if (activeGroupIds.length === 1) {
		return activeGroupIds[0];
	}

	return `task_group_${toText(event.taskId).trim() || state.peekCounter()}`;
}

export function buildNextTaskItem(input: {
	event: AgentEvent;
	state: EventProcessorState;
	taskId: string;
	status: string;
	updatedAt: number;
	existing?: TaskItemMeta;
	groupId: string;
}): TaskItemMeta {
	const { event, state, taskId, status, updatedAt, existing, groupId } = input;
	const taskName =
		toText(event.taskName).trim() ||
		existing?.taskName ||
		state.getPlanTaskDescription?.(taskId) ||
		taskId;
	const startedAt =
		status === "running"
			? (existing?.startedAt ?? (event.timestamp || updatedAt))
			: (existing?.startedAt ?? event.timestamp ?? updatedAt);
	const endedAt =
		status === "running" ? undefined : event.timestamp || updatedAt;

	return {
		taskId,
		taskName,
		taskGroupId: groupId,
		subAgentKey: readSubAgentKey(event) || existing?.subAgentKey || "",
		runId: toText(event.runId) || existing?.runId || state.runId,
		status,
		startedAt,
		endedAt,
		durationMs: computeTaskDurationMs(startedAt, endedAt),
		updatedAt,
		error:
			status === "failed" ? toText(event.error) || existing?.error || "" : "",
	};
}
