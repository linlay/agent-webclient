import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";
import { MAX_DEBUG_LINES, MAX_EVENTS } from "@/app/state/constants";
import {
	addSetValue,
	setMapValue,
	toggleSetValue,
} from "@/app/state/reducerHelpers";

export function reduceConversationState(
	state: AppState,
	action: AppAction,
): AppState | null {
	switch (action.type) {
		case "SET_CHAT_ID":
			return { ...state, chatId: action.chatId };
		case "SET_RUN_ID":
			return { ...state, runId: action.runId };
		case "SET_REQUEST_ID":
			return { ...state, requestId: action.requestId };
		case "SET_STREAMING":
			return { ...state, streaming: action.streaming };
		case "SET_ABORT_CONTROLLER":
			return { ...state, abortController: action.controller };
		case "PUSH_EVENT": {
			const events =
				state.events.length >= MAX_EVENTS
					? [...state.events.slice(-Math.floor(MAX_EVENTS * 0.8)), action.event]
					: [...state.events, action.event];
			return { ...state, events };
		}
		case "CLEAR_EVENTS":
			return { ...state, events: [] };
		case "APPEND_DEBUG": {
			const debugLines =
				state.debugLines.length >= MAX_DEBUG_LINES
					? [
							...state.debugLines.slice(-Math.floor(MAX_DEBUG_LINES * 0.8)),
							action.line,
						]
					: [...state.debugLines, action.line];
			return { ...state, debugLines };
		}
		case "CLEAR_DEBUG":
			return { ...state, debugLines: [] };
		case "SET_MESSAGE":
			return {
				...state,
				messagesById: setMapValue(state.messagesById, action.id, action.message),
			};
		case "SET_MESSAGE_ORDER":
			return { ...state, messageOrder: action.order };
		case "SET_STEER_DRAFT":
			return { ...state, steerDraft: action.draft };
		case "ENQUEUE_PENDING_STEER":
			return {
				...state,
				pendingSteers: [...state.pendingSteers, action.steer],
			};
		case "REMOVE_PENDING_STEER":
			return {
				...state,
				pendingSteers: state.pendingSteers.filter(
					(steer) => steer.steerId !== action.steerId,
				),
			};
		case "CLEAR_PENDING_STEERS":
			if (state.pendingSteers.length === 0) {
				return state;
			}
			return { ...state, pendingSteers: [] };
		case "TOGGLE_RUN_DOWNVOTE":
			return {
				...state,
				downvotedRunKeys: toggleSetValue(state.downvotedRunKeys, action.runKey),
			};
		case "ADD_EXECUTED_ACTION_ID":
			return {
				...state,
				executedActionIds: addSetValue(state.executedActionIds, action.actionId),
			};
		default:
			return null;
	}
}
