import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";
import {
	switchComposerChat,
	updateComposerDraft,
	updateComposerSelectedSkills,
	type PendingSteer,
} from "@/features/composer/lib/composerState";
import { MAX_DEBUG_LINES, MAX_EVENTS } from "@/app/state/constants";
import { bindRunAgentKey } from "@/features/runs/lib/runAgentIdentity";
import { appendVisibleDebugEvent } from "@/features/events/lib/debugEventDisplay";
import {
	addSetValue,
	removeSetValue,
	setMapValue,
	toggleSetValue,
} from "@/app/state/reducerHelpers";

export function reduceConversationState(
	state: AppState,
	action: AppAction,
): AppState | null {
	switch (action.type) {
		case "BEGIN_CHAT_TRANSITION": {
			if (action.transition.seq <= state.chatLoadSeq) {
				return state;
			}
			return {
				...state,
				chatLoadSeq: action.transition.seq,
				chatTransition: action.transition,
			};
		}
		case "SET_CHAT_TRANSITION_DISPLAY_MODE": {
			const transition = state.chatTransition;
			if (
				!transition ||
				transition.phase === "error" ||
				transition.seq !== action.seq ||
				transition.targetChatId !== action.targetChatId ||
				(transition.displayMode === "background" &&
					action.displayMode === "blocking") ||
				transition.displayMode === action.displayMode
			) {
				return state;
			}
			return {
				...state,
				chatTransition: {
					...transition,
					displayMode: action.displayMode,
				},
			};
		}
		case "ADVANCE_CHAT_TRANSITION": {
			const transition = state.chatTransition;
			if (
				!transition ||
				transition.phase === "error" ||
				transition.phase === "ready" ||
				transition.seq !== action.seq ||
				transition.targetChatId !== action.targetChatId
			) {
				return state;
			}
			return {
				...state,
				chatTransition: {
					...transition,
					phase: action.phase,
					error: "",
				},
			};
		}
		case "FAIL_CHAT_TRANSITION": {
			const transition = state.chatTransition;
			if (
				!transition ||
				transition.seq !== action.seq ||
				transition.targetChatId !== action.targetChatId
			) {
				return state;
			}
			return {
				...state,
				chatTransition: {
					...transition,
					phase: "error",
					error: action.error,
				},
			};
		}
		case "CLEAR_CHAT_TRANSITION":
			return state.chatTransition ? { ...state, chatTransition: null } : state;
		case "SET_CHAT_SURFACE_BLOCKED":
			return state.chatSurfaceBlocked === action.blocked
				? state : { ...state, chatSurfaceBlocked: action.blocked };
		case "REQUEST_CONVERSATION_SCROLL": {
			const id = (state.conversationScrollRequest?.id || 0) + 1;
			return {
				...state,
				conversationScrollRequest: {
					id,
					chatId: String(action.chatId || "").trim(),
					target: "bottom",
					reason: action.reason,
				},
			};
		}
		case "SET_CHAT_ID": {
			const restored = state.planningModeByChatId[action.chatId];
			const currentPlanningMode = state.planningMode;
			const isNewChatId = action.chatId !== state.chatId;
			const activeRunPlanningMode =
				restored === undefined
					? (() => {
							const chat = state.chats.find((c) => c.chatId === action.chatId);
							if (
								chat?.activeRun &&
								typeof chat.activeRun === "object" &&
								!Array.isArray(chat.activeRun)
							) {
								return Boolean(
									(chat.activeRun as Record<string, unknown>).planningMode,
								);
							}
							return false;
						})()
					: false;
			const nextPlanningMode =
				restored !== undefined
					? restored
					: activeRunPlanningMode
						? true
						: currentPlanningMode && isNewChatId
							? true
							: false;
			const nextByChatId =
				restored === undefined && currentPlanningMode && isNewChatId
					? { ...state.planningModeByChatId, [action.chatId]: true }
					: state.planningModeByChatId;

			return {
				...state,
				...switchComposerChat(state, state.chatId, action.chatId),
				chatId: action.chatId,
				currentChatActiveRun: isNewChatId ? null : state.currentChatActiveRun,
				pendingNewChatAgentKey: action.chatId
					? ""
					: state.pendingNewChatAgentKey,
				planningMode: nextPlanningMode,
				planningModeByChatId: nextByChatId,
				editingMode: isNewChatId ? false : state.editingMode,
			};
		}
		case "SET_CURRENT_CHAT_ACTIVE_RUN": {
			const activeRun = action.activeRun;
			if (!activeRun) {
				return { ...state, currentChatActiveRun: null };
			}
			const chatId = String(activeRun.chatId || "").trim();
			const runId = String(activeRun.runId || "").trim();
			if (!chatId || !runId) {
				return { ...state, currentChatActiveRun: null };
			}
			if (state.chatId && state.chatId !== chatId) {
				return state;
			}
			return {
				...state,
				currentChatActiveRun: {
					...activeRun,
					chatId,
					runId,
				},
			};
		}
		case "SET_RUN_ID": {
			const runId = String(action.runId || "").trim();
			return {
				...state,
				runId,
				currentRunAgentKey: runId
					? state.runAgentById.get(runId) || ""
					: "",
			};
		}
		case "SET_RUN_AGENT_BY_ID": {
			const runId = String(action.runId || "").trim();
			const agentKey = String(action.agentKey || "").trim();
			if (!runId || !agentKey) {
				return state;
			}
			const runAgentById = bindRunAgentKey(state.runAgentById, runId, agentKey);
			return {
				...state,
				runAgentById,
				currentRunAgentKey:
					state.runId === runId ? agentKey : state.currentRunAgentKey,
			};
		}
		case "SET_CURRENT_RUN_AGENT_KEY":
			return {
				...state,
				currentRunAgentKey: String(action.agentKey || "").trim(),
			};
		case "SET_REQUEST_ID":
			return { ...state, requestId: action.requestId };
		case "SET_STREAMING":
			return {
				...state,
				streaming: action.streaming,
			};
		case "SET_ABORT_CONTROLLER":
			return { ...state, abortController: action.controller };
		case "PUSH_EVENT": {
			const events =
				state.events.length >= MAX_EVENTS
					? [...state.events.slice(-Math.floor(MAX_EVENTS * 0.8)), action.event]
					: [...state.events, action.event];
			const debugEvents = appendVisibleDebugEvent(
				state.debugEvents,
				action.event,
				MAX_EVENTS,
				events,
				{
					contentNodeById: state.contentNodeById,
					reasoningNodeById: state.reasoningNodeById,
					timelineNodes: state.timelineNodes,
					activeReasoningKey: state.activeReasoningKey,
					runId: state.runId,
				},
			);
			return { ...state, events, debugEvents };
		}
		case "CLEAR_EVENTS":
			return {
				...state,
				events: [],
				debugEvents: [],
				timelineOrder: [],
				timelineNodes: new Map(),
				timelineNodeByMessageId: new Map(),
				timelineDomCache: new Map(),
				timelineCounter: 0,
				contentNodeById: new Map(),
				reasoningNodeById: new Map(),
				toolNodeById: new Map(),
				toolStates: new Map(),
				taskItemsById: new Map(),
				activeTaskIds: new Set(),
				actionStates: new Map(),
				activeReasoningKey: "",
				activeFrontendTool: null,
				activeAwaiting: null,
				pendingAwaitings: [],
			};
		case "CLEAR_CONVERSATION_OVERVIEW":
			return {
				...state,
				artifacts: [],
				fileChanges: [],
				plan: null,
				planRuntimeByTaskId: new Map(),
				taskItemsById: new Map(),
				activeTaskIds: new Set(),
				planCurrentRunningTaskId: "",
				planLastTouchedTaskId: "",
			};
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
		case "SET_COMPOSER_DRAFT": {
			return {
				...state,
				...updateComposerDraft(state, state.chatId, action.draft),
			};
		}
		case "SET_SELECTED_SKILLS": {
			return {
				...state,
				...updateComposerSelectedSkills(state, state.chatId, action.skills),
			};
		}
		case "ENQUEUE_PENDING_STEER": {
			const chatId = state.chatId || "";
			const existing = state.pendingSteers[chatId] || [];
			return {
				...state,
				pendingSteers: { ...state.pendingSteers, [chatId]: [...existing, action.steer] },
			};
		}
		case "UPDATE_PENDING_STEER_STATUS": {
			const next: Record<string, PendingSteer[]> = {};
			let changed = false;
			for (const cid of Object.keys(state.pendingSteers)) {
				const updated = state.pendingSteers[cid].map((steer) =>
					steer.steerId === action.steerId
						? ((changed = true), { ...steer, status: action.status })
						: steer,
				);
				next[cid] = changed ? updated : state.pendingSteers[cid];
			}
			if (!changed) return state;
			return { ...state, pendingSteers: next };
		}
		case "REMOVE_PENDING_STEER": {
			const next: Record<string, PendingSteer[]> = {};
			let removed = false;
			for (const cid of Object.keys(state.pendingSteers)) {
				const filtered = state.pendingSteers[cid].filter(
					(steer) => steer.steerId !== action.steerId,
				);
				if (filtered.length < state.pendingSteers[cid].length) {
					removed = true;
				}
				if (filtered.length === 0) continue;
				next[cid] = filtered;
			}
			if (!removed) return state;
			return { ...state, pendingSteers: next };
		}
		case "CLEAR_PENDING_STEERS": {
			const chatId = state.chatId || "";
			const existing = state.pendingSteers[chatId];
			if (!existing || existing.length === 0) {
				return state;
			}
			return { ...state, pendingSteers: { ...state.pendingSteers, [chatId]: [] } };
		}
		case "TOGGLE_RUN_DOWNVOTE":
			return {
				...state,
				downvotedRunKeys: toggleSetValue(state.downvotedRunKeys, action.runKey),
			};
		case "SET_RUN_DOWNVOTED":
			return {
				...state,
				downvotedRunKeys: action.downvoted
					? addSetValue(state.downvotedRunKeys, action.runKey)
					: removeSetValue(state.downvotedRunKeys, action.runKey),
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
