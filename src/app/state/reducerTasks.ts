import { reduceTasksState as reduceTaskItemsState } from "@/features/tasks/lib/tasksState";
import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";

export function reduceTasksState(
	state: AppState,
	action: AppAction,
): AppState | null {
	return reduceTaskItemsState(state, action);
}
