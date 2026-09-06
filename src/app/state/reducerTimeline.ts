import { reduceArtifactsState } from "@/features/artifacts/lib/artifactsState";
import { reduceOverviewState } from "@/features/overview/lib/overviewState";
import { reduceToolsState } from "@/features/tools/lib/toolsState";
import { reduceTimelineState as reduceTimelineDomainState } from "@/features/timeline/lib/timelineState";
import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";
import { setMapValue } from "@/app/state/reducerHelpers";

export function reduceTimelineState(
	state: AppState,
	action: AppAction,
): AppState | null {
	switch (action.type) {
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
		case "ADD_EXECUTED_ACTION_ID":
			// Conversation owns this action; keep this entry point outside its scope.
			return null;
		default:
			return reduceArtifactsState(state, action)
				?? reduceOverviewState(state, action)
				?? reduceToolsState(state, action)
				?? reduceTimelineDomainState(state, action);
	}
}
