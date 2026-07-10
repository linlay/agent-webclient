import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";

export function reducePlanState(
	state: AppState,
	action: AppAction,
): AppState | null {
	switch (action.type) {
		case "SET_PLAN":
			return { ...state, plan: action.plan };
		case "SET_PLAN_EXPANDED":
			return { ...state, planExpanded: action.expanded };
		case "SET_PLAN_MANUAL_OVERRIDE":
			return { ...state, planManualOverride: action.override };
		case "SET_PLAN_AUTO_COLLAPSE_TIMER":
			return { ...state, planAutoCollapseTimer: action.timer };
		default:
			return null;
	}
}
