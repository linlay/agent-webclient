import type { AppState } from "@/app/state/types";
import type { AppAction } from "@/app/state/actions";
import { reduceConversationState } from "@/app/state/reducerConversation";
import { reduceNavigationState } from "@/app/state/reducerNavigation";
import { reduceTasksState } from "@/app/state/reducerTasks";
import { reduceTimelineState } from "@/app/state/reducerTimeline";
import { reduceUiState } from "@/app/state/reducerUi";
import {
  reduceMemoryDomain,
  reducePlanDomain,
  reduceVoiceDomain,
} from "@/app/state/domainSliceReducers";

export type DomainReducer = (
	state: AppState,
	action: AppAction,
) => AppState | null;

export const domainReducers: DomainReducer[] = [
	reduceNavigationState,
	reduceConversationState,
	reduceMemoryDomain,
	reducePlanDomain,
	reduceTasksState,
	reduceTimelineState,
	reduceVoiceDomain,
	reduceUiState,
];
