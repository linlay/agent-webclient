import type { AppState } from "@/app/state/types";
import type { AppAction } from "@/app/state/actions";
import { reduceConversationState } from "@/app/state/reducerConversation";
import { reduceNavigationState } from "@/app/state/reducerNavigation";
import { reduceTasksState } from "@/features/tasks/lib/tasksState";
import { reduceTimelineState } from "@/app/state/reducerTimeline";
import { reduceUiState } from "@/app/state/reducerUi";
import { reduceMemoryState } from "@/features/memory/lib/memoryState";
import { reducePlanState } from "@/features/plan/lib/planState";
import { reduceVoiceState } from "@/features/voice/lib/voiceState";
import { reduceComposerInteractionState } from "@/features/composer/lib/composerState";

export type DomainReducer = (
	state: AppState,
	action: AppAction,
) => AppState | null;

export const domainReducers: DomainReducer[] = [
	reduceNavigationState,
	reduceConversationState,
	reduceMemoryState,
	reducePlanState,
	reduceTasksState,
	reduceTimelineState,
	reduceVoiceState,
	reduceComposerInteractionState,
	reduceUiState,
];
