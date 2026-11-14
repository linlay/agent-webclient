import { initializeChatModel, removeChatModel } from "@/features/composer/lib/composerModelSelection";
import { resolveComposerAccessScope } from "@/features/composer/lib/composerAccessLevel";
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
			return buildConversationResetState(state, { preserveVoiceSession: action.preserveVoiceSession });
		case "RESET_ACTIVE_CONVERSATION":
			return buildConversationResetState(state, {
				preserveWorkerContext: true,
				preserveVoiceSession: action.preserveVoiceSession,
			});
		case "CLEAR_GATEWAY_IDENTITY_STATE":
			return { ...state, composerUploadChatId: "", composerReferences: [], currentAgent: null, agents: [],  chats: [], chatPinnedOrder: null, chatPinningPending: false, automations: [] };
		case "APPLY_CONVERSATION_REPLAY":
			return {
				...initializeChatModel(state, resolveComposerAccessScope(state.accessToken), action.snapshot.chatId, action.snapshot.events),
				chatId: action.snapshot.chatId,
				currentChatActiveRun: action.snapshot.currentChatActiveRun,
				runId: action.snapshot.runId,
				timelineNodes: action.snapshot.timelineNodes,
				timelineOrder: action.snapshot.timelineOrder,
				contentNodeById: action.snapshot.contentNodeById,
				reasoningNodeById: action.snapshot.reasoningNodeById,
				toolNodeById: action.snapshot.toolNodeById,
				toolStates: action.snapshot.toolStates,
				timelineCounter: action.snapshot.timelineCounter,
				activeReasoningKey: action.snapshot.activeReasoningKey,
				activeAwaiting: action.snapshot.activeAwaiting,
				pendingAwaitings: action.snapshot.pendingAwaitings,
				events: action.snapshot.events,
				debugEvents: action.snapshot.debugEvents,
				artifacts: action.snapshot.artifacts,
				fileChanges: action.snapshot.fileChanges,
				plan: action.snapshot.plan,
				planRuntimeByTaskId: action.snapshot.planRuntimeByTaskId,
				taskItemsById: action.snapshot.taskItemsById,
				activeTaskIds: action.snapshot.activeTaskIds,
				planCurrentRunningTaskId: action.snapshot.planCurrentRunningTaskId,
				planLastTouchedTaskId: action.snapshot.planLastTouchedTaskId,
				downvotedRunKeys: action.snapshot.downvotedRunKeys,
			};
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
  const reduced = reduceSubmissionDraft(state, action as ComposerAction) ?? reduceAppState(state, action);
  const next = action.type === "CHAT_DELETED"
    ? removeChatModel(reduced, resolveComposerAccessScope(state.accessToken), action.chatId) : reduced;
  const edited = next.composerDraft !== state.composerDraft ||
    JSON.stringify(next.composerReferences) !== JSON.stringify(state.composerReferences) ||
    next.chatId !== state.chatId || next.workerSelectionKey !== state.workerSelectionKey ||
    next.pendingNewChatAgentKey !== state.pendingNewChatAgentKey ||
    action.type === "RESET_CONVERSATION" || action.type === "RESET_ACTIVE_CONVERSATION";
  return edited ? { ...next, composerEditVersion: next.composerEditVersion + 1 } : next;
}
