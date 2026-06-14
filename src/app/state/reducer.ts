import type { AppState } from "@/app/state/types";
import type { AppAction } from "@/app/state/actions";
import { buildConversationResetState } from "@/app/state/conversationReset";
import { domainReducers } from "@/app/state/domainReducers";

export type { AppAction } from "@/app/state/actions";

export function appReducer(state: AppState, action: AppAction): AppState {
	switch (action.type) {
		case "RESET_CONVERSATION":
			return buildConversationResetState(state);
		case "RESET_ACTIVE_CONVERSATION":
			return buildConversationResetState(state, {
				preserveWorkerContext: true,
			});
		case "BATCH_UPDATE":
			return { ...state, ...action.updates };
		default:
			for (const reduceDomain of domainReducers) {
				const nextState = reduceDomain(state, action);
				if (nextState) {
					return nextState;
				}
			}
			return state;
	}
}
