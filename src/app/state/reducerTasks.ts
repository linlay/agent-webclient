import { reduceTasksState as reduceTaskItemsState } from "@/features/tasks/lib/tasksState";
import { reducePlanState } from "@/features/plan/lib/planState";
import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";

export function reduceTasksState(
	state: AppState,
	action: AppAction,
): AppState | null {
	switch (action.type) {
		case "SET_PLAN_CURRENT_RUNNING_TASK_ID":
		case "SET_PLAN_LAST_TOUCHED_TASK_ID":
		case "SET_PLAN_RUNTIME":
			return { ...state, ...reducePlanState(state, action) };
		default:
			return reduceTaskItemsState(state, action);
	}
}
