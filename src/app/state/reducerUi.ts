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
		case "SET_EDITING_MODE":
			return { ...state, editingMode: action.enabled };
		case "SET_MENTION_OPEN":
			return { ...state, mentionOpen: action.open };
		case "SET_MENTION_SUGGESTIONS":
			return { ...state, mentionSuggestions: action.agents };
		case "SET_MENTION_ACTIVE_INDEX":
			return { ...state, mentionActiveIndex: action.index };
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
