import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";
import { reduceMemoryState, type MemoryAction } from "@/features/memory/lib/memoryState";
import { reducePlanState, type PlanAction } from "@/features/plan/lib/planState";
import { reduceVoiceState, type VoiceAction } from "@/features/voice/lib/voiceState";

type RootDomainReducer = (state: AppState, action: AppAction) => AppState | null;

const memoryActionTypes = new Set<MemoryAction["type"]>([
  "SET_MEMORY_CONSOLE_TAB", "RESET_MEMORY_INFO_SESSION", "SET_MEMORY_INFO_LOADING",
  "SET_MEMORY_INFO_ERROR", "SET_MEMORY_INFO_FILTERS", "SET_MEMORY_INFO_RECORDS",
  "SET_MEMORY_INFO_SELECTED_RECORD_ID", "SET_MEMORY_INFO_DETAIL_LOADING",
  "SET_MEMORY_INFO_DETAIL_ERROR", "SET_MEMORY_INFO_DETAIL", "SET_MEMORY_META",
  "SET_MEMORY_PREFERENCE_SCOPES", "SET_MEMORY_PREFERENCE_ACTIVE_SCOPE",
  "SET_MEMORY_PREFERENCE_LOADING", "SET_MEMORY_PREFERENCE_ERROR", "SET_MEMORY_PREFERENCE_MODE",
  "SET_MEMORY_PREFERENCE_MARKDOWN_DRAFT", "SET_MEMORY_PREFERENCE_RECORDS_DRAFT",
  "SET_MEMORY_PREFERENCE_SELECTED_RECORD_ID", "SET_MEMORY_PREFERENCE_DIRTY",
  "SET_MEMORY_PREFERENCE_SAVING", "SET_MEMORY_PREFERENCE_SAVE_SUMMARY",
  "SET_MEMORY_PREFERENCE_VALIDATION", "SET_MEMORY_PREVIEW_DRAFT",
  "SET_MEMORY_PREVIEW_LOADING", "SET_MEMORY_PREVIEW_ERROR", "SET_MEMORY_PREVIEW_RESULT",
  "SET_MEMORY_PREVIEW_PROMPT_LAYER",
]);
const planActionTypes = new Set<PlanAction["type"]>([
  "SET_PLAN", "SET_PLAN_EXPANDED", "SET_PLAN_MANUAL_OVERRIDE", "SET_PLAN_RUNTIME",
  "SET_PLAN_CURRENT_RUNNING_TASK_ID", "SET_PLAN_LAST_TOUCHED_TASK_ID", "SET_PLAN_AUTO_COLLAPSE_TIMER",
]);
const voiceActionTypes = new Set<VoiceAction["type"]>([
  "SET_WS_STATUS", "SET_WS_ERROR_MESSAGE", "SET_AUDIO_MUTED", "SET_TTS_DEBUG_STATUS",
  "SET_INPUT_MODE", "PATCH_VOICE_CHAT",
]);

export const reduceMemoryDomain: RootDomainReducer = (state, action) =>
  memoryActionTypes.has(action.type as MemoryAction["type"])
    ? reduceMemoryState(state, action as MemoryAction) as AppState
    : null;

export const reducePlanDomain: RootDomainReducer = (state, action) =>
  planActionTypes.has(action.type as PlanAction["type"])
    ? reducePlanState(state, action as PlanAction) as AppState
    : null;

export const reduceVoiceDomain: RootDomainReducer = (state, action) =>
  voiceActionTypes.has(action.type as VoiceAction["type"])
    ? reduceVoiceState(state, action as VoiceAction) as AppState
    : null;
