import { reduceSubmissionDraft } from "@/features/composer/lib/submissionDraft";
import type { ComposerAction } from "@/features/composer/lib/composerState";
import type { AppState } from "@/app/state/types";
import type { AppAction } from "@/app/state/actions";
import { buildConversationResetState } from "@/app/state/conversationReset";
import { domainReducers } from "@/app/state/domainReducers";

export type { AppAction } from "@/app/state/actions";

function reduceAppState(state: AppState, action: AppAction): AppState {
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

export function appReducer(state: AppState, action: AppAction): AppState {
  const next = reduceSubmissionDraft(state, action as ComposerAction) ?? reduceAppState(state, action);
  const edited = next.composerDraft !== state.composerDraft ||
    JSON.stringify(next.selectedSkills) !== JSON.stringify(state.selectedSkills) ||
    next.chatId !== state.chatId || next.workerSelectionKey !== state.workerSelectionKey ||
    next.pendingNewChatAgentKey !== state.pendingNewChatAgentKey ||
    action.type === "RESET_CONVERSATION" || action.type === "RESET_ACTIVE_CONVERSATION";
  return edited ? { ...next, composerEditVersion: next.composerEditVersion + 1 } : next;
}
