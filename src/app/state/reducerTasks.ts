import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";
import {
	addSetValue,
	removeSetValue,
	setMapValue,
} from "@/app/state/reducerHelpers";

export function reduceTasksState(
	state: AppState,
	action: AppAction,
): AppState | null {
	switch (action.type) {
		case "SET_TASK_ITEM_META":
			return {
				...state,
				taskItemsById: setMapValue(
					state.taskItemsById,
					action.taskId,
					action.task,
				),
			};
		case "ADD_ACTIVE_TASK_ID":
			return {
				...state,
				activeTaskIds: addSetValue(state.activeTaskIds, action.taskId),
			};
		case "REMOVE_ACTIVE_TASK_ID":
			return {
				...state,
				activeTaskIds: removeSetValue(state.activeTaskIds, action.taskId),
			};
		case "SET_PLAN_CURRENT_RUNNING_TASK_ID":
			return { ...state, planCurrentRunningTaskId: action.taskId };
		case "SET_PLAN_LAST_TOUCHED_TASK_ID":
			return { ...state, planLastTouchedTaskId: action.taskId };
		case "SET_PLAN_RUNTIME":
			return {
				...state,
				planRuntimeByTaskId: setMapValue(
					state.planRuntimeByTaskId,
					action.taskId,
					action.runtime,
				),
			};
		default:
			return null;
	}
}
