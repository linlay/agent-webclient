import { reduceViewersState } from "@/features/viewers/lib/viewerState";
import { reduceUsageState } from "@/features/usage/lib/usageState";
import { reduceAppChromeState } from "@/app/state/appChromeState";
import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";

export function reduceUiState(
	state: AppState,
	action: AppAction,
): AppState | null {
	switch (action.type) {
		case "SET_PLANNING_MODE": {
			const next = { ...state, planningMode: action.enabled };
			if (action.persist !== false) {
				next.planningModeByChatId = {
					...state.planningModeByChatId,
					[action.chatId]: action.enabled,
				};
			}
			return next;
		}
		case "SET_ACCESS_TOKEN":
			return { ...reduceAppChromeState(state, action), wsErrorMessage: "" };
		case "CLOSE_RIGHT_SIDEBAR":
			return {
				...reduceViewersState(state, action),
				artifactExpanded: false,
				artifactManualOverride: false,
			};
		default:
			return reduceViewersState(state, action)
				?? reduceUsageState(state, action)
				?? reduceAppChromeState(state, action);
	}
}
