import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";
import {
	deleteMapValue,
	patchActiveAwaiting,
	setMapValue,
	upsertArtifact,
	upsertFileChange,
} from "@/app/state/reducerHelpers";

export function reduceTimelineState(
	state: AppState,
	action: AppAction,
): AppState | null {
	switch (action.type) {
		case "UPSERT_ARTIFACT":
			return {
				...state,
				artifacts: upsertArtifact(state.artifacts, action.artifact),
			};
		case "UPSERT_FILE_CHANGE":
			return {
				...state,
				fileChanges: upsertFileChange(state.fileChanges, action.fileChange),
			};
		case "SET_ARTIFACT_EXPANDED":
			return { ...state, artifactExpanded: action.expanded };
		case "SET_ARTIFACT_MANUAL_OVERRIDE":
			return { ...state, artifactManualOverride: action.override };
		case "SET_ARTIFACT_AUTO_COLLAPSE_TIMER":
			return { ...state, artifactAutoCollapseTimer: action.timer };
		case "SET_ACTIVE_FRONTEND_TOOL":
			return { ...state, activeFrontendTool: action.tool };
		case "SET_ACTIVE_AWAITING":
			return { ...state, activeAwaiting: action.awaiting };
		case "SET_AWAITING_RUNTIME":
			return {
				...state,
				activeAwaiting: action.activeAwaiting,
				pendingAwaitings: action.pendingAwaitings,
			};
		case "PATCH_ACTIVE_AWAITING":
			if (!state.activeAwaiting) {
				return state;
			}
			return {
				...state,
				activeAwaiting: patchActiveAwaiting(state.activeAwaiting, action.patch),
			};
		case "CLEAR_ACTIVE_AWAITING":
			if (!state.activeAwaiting && state.pendingAwaitings.length === 0) {
				return state;
			}
			return {
				...state,
				activeAwaiting: state.pendingAwaitings[0] ?? null,
				pendingAwaitings: state.pendingAwaitings.slice(1),
			};
		case "SET_TIMELINE_NODE":
			return {
				...state,
				timelineNodes: setMapValue(state.timelineNodes, action.id, action.node),
			};
		case "PATCH_CONTENT_TTS_VOICE_BLOCK": {
			const current = state.timelineNodes.get(action.nodeId);
			if (!current || current.kind !== "content") {
				return state;
			}

			const blocks = { ...(current.ttsVoiceBlocks || {}) };
			const existing = blocks[action.signature] || {
				signature: action.signature,
				text: "",
				closed: false,
				expanded: false,
				status: "ready" as const,
				error: "",
			};
			blocks[action.signature] = {
				...existing,
				...action.patch,
				signature: action.signature,
			};

			return {
				...state,
				timelineNodes: setMapValue(state.timelineNodes, action.nodeId, {
					...current,
					ttsVoiceBlocks: blocks,
				}),
			};
		}
		case "REMOVE_INACTIVE_CONTENT_TTS_VOICE_BLOCKS": {
			const current = state.timelineNodes.get(action.nodeId);
			if (!current || current.kind !== "content" || !current.ttsVoiceBlocks) {
				return state;
			}

			const blocks = { ...current.ttsVoiceBlocks };
			let changed = false;
			for (const signature of Object.keys(blocks)) {
				if (!action.activeSignatures.has(signature)) {
					delete blocks[signature];
					changed = true;
				}
			}
			if (!changed) {
				return state;
			}

			return {
				...state,
				timelineNodes: setMapValue(state.timelineNodes, action.nodeId, {
					...current,
					ttsVoiceBlocks: blocks,
				}),
			};
		}
		case "APPEND_TIMELINE_ORDER":
			return {
				...state,
				timelineOrder: [...state.timelineOrder, action.id],
			};
		case "SET_TOOL_STATE":
			return {
				...state,
				toolStates: setMapValue(state.toolStates, action.key, action.state),
			};
		case "SET_PENDING_TOOL":
			return {
				...state,
				pendingTools: setMapValue(state.pendingTools, action.key, action.tool),
			};
		case "SET_ACTION_STATE":
			return {
				...state,
				actionStates: setMapValue(state.actionStates, action.key, action.state),
			};
		case "SET_CONTENT_NODE_BY_ID":
			return {
				...state,
				contentNodeById: setMapValue(
					state.contentNodeById,
					action.contentId,
					action.nodeId,
				),
			};
		case "SET_REASONING_NODE_BY_ID":
			return {
				...state,
				reasoningNodeById: setMapValue(
					state.reasoningNodeById,
					action.reasoningId,
					action.nodeId,
				),
			};
		case "SET_REASONING_COLLAPSE_TIMER":
			return {
				...state,
				reasoningCollapseTimers: setMapValue(
					state.reasoningCollapseTimers,
					action.reasoningId,
					action.timer,
				),
			};
		case "CLEAR_REASONING_COLLAPSE_TIMER":
			return {
				...state,
				reasoningCollapseTimers: deleteMapValue(
					state.reasoningCollapseTimers,
					action.reasoningId,
				),
			};
		case "SET_TOOL_NODE_BY_ID":
			return {
				...state,
				toolNodeById: setMapValue(state.toolNodeById, action.toolId, action.nodeId),
			};
		case "SET_ACTIVE_REASONING_KEY":
			return { ...state, activeReasoningKey: action.key };
		case "INCREMENT_TIMELINE_COUNTER":
			return { ...state, timelineCounter: state.timelineCounter + 1 };
		default:
			return null;
	}
}
