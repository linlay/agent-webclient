import { reduceArtifactsState } from "@/features/artifacts/lib/artifactsState";
import { reduceOverviewState } from "@/features/overview/lib/overviewState";
import { reduceToolsState } from "@/features/tools/lib/toolsState";
import { reduceTimelineState as reduceTimelineDomainState } from "@/features/timeline/lib/timelineState";
import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";

export function reduceTimelineState(
	state: AppState,
	action: AppAction,
): AppState | null {
	switch (action.type) {
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
