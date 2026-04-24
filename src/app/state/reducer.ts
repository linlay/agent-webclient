import type { AppState } from "@/app/state/types";
import type { AppAction } from "@/app/state/actions";
import { buildConversationResetState } from "@/app/state/reducerHelpers";
import { reduceConversationState } from "@/app/state/reducerConversation";
import { reduceNavigationState } from "@/app/state/reducerNavigation";
import { reduceTimelineState } from "@/app/state/reducerTimeline";
import { reduceUiState } from "@/app/state/reducerUi";
import { reduceVoiceState } from "@/app/state/reducerVoice";

export type { AppAction } from "@/app/state/actions";

type DomainReducer = (state: AppState, action: AppAction) => AppState | null;

const domainReducers: DomainReducer[] = [
	reduceNavigationState,
	reduceConversationState,
	reduceTimelineState,
	reduceUiState,
	reduceVoiceState,
];

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
