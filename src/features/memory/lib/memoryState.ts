import type {
  MemoryConsoleTab,
  MemoryContextPreviewResponse,
  MemoryContextPromptLayer,
  MemoryInfoFilters,
  MemoryMeta,
  MemoryPreferenceMode,
  MemoryRecordDetail,
  MemoryRecordListItem,
  MemoryScopeDetailMeta,
  MemoryScopeDraftRecord,
  MemoryScopeSaveSummary,
  MemoryScopeSummary,
  MemoryScopeValidationResult,
} from "@/shared/data/memory/memoryTypes";
import {
  createDefaultMemoryConsoleTab,
  createDefaultMemoryInfoFilters,
  createDefaultMemoryPreferenceMode,
} from "@/shared/data/memory/memoryTypes";

export interface MemoryState {
  memoryConsoleTab: MemoryConsoleTab;
  memoryInfoLoading: boolean;
  memoryInfoError: string;
  memoryInfoRecords: MemoryRecordListItem[];
  memoryInfoSelectedRecordId: string;
  memoryInfoDetail: MemoryRecordDetail | null;
  memoryInfoDetailLoading: boolean;
  memoryInfoDetailError: string;
  memoryInfoFilters: MemoryInfoFilters;
  memoryInfoNextCursor: string;
  memoryMeta: MemoryMeta | null;
  memoryPreferenceScopes: MemoryScopeSummary[];
  memoryPreferenceActiveScopeType: string;
  memoryPreferenceActiveScopeKey: string;
  memoryPreferenceLabel: string;
  memoryPreferenceFileName: string;
  memoryPreferenceMeta: MemoryScopeDetailMeta | null;
  memoryPreferenceLoading: boolean;
  memoryPreferenceError: string;
  memoryPreferenceMode: MemoryPreferenceMode;
  memoryPreferenceMarkdownDraft: string;
  memoryPreferenceRecordsDraft: MemoryScopeDraftRecord[];
  memoryPreferenceSelectedRecordId: string;
  memoryPreferenceDirty: boolean;
  memoryPreferenceSaving: boolean;
  memoryPreferenceSaveSummary: MemoryScopeSaveSummary | null;
  memoryPreferenceValidation: MemoryScopeValidationResult | null;
  memoryPreviewDraft: string;
  memoryPreviewLoading: boolean;
  memoryPreviewError: string;
  memoryPreviewResult: MemoryContextPreviewResponse | null;
  memoryPreviewPromptLayer: MemoryContextPromptLayer;
}

export type MemoryAction =
  | { type: "SET_MEMORY_CONSOLE_TAB"; tab: MemoryConsoleTab }
  | { type: "RESET_MEMORY_INFO_SESSION" }
  | { type: "SET_MEMORY_INFO_LOADING"; loading: boolean }
  | { type: "SET_MEMORY_INFO_ERROR"; error: string }
  | { type: "SET_MEMORY_INFO_FILTERS"; filters: Partial<MemoryInfoFilters> }
  | { type: "SET_MEMORY_INFO_RECORDS"; records: MemoryRecordListItem[]; nextCursor?: string; selectedRecordId?: string }
  | { type: "SET_MEMORY_INFO_SELECTED_RECORD_ID"; id: string }
  | { type: "SET_MEMORY_INFO_DETAIL_LOADING"; loading: boolean }
  | { type: "SET_MEMORY_INFO_DETAIL_ERROR"; error: string }
  | { type: "SET_MEMORY_INFO_DETAIL"; detail: MemoryRecordDetail | null }
  | { type: "SET_MEMORY_META"; meta: MemoryMeta | null }
  | { type: "SET_MEMORY_PREFERENCE_SCOPES"; scopes: MemoryScopeSummary[] }
  | { type: "SET_MEMORY_PREFERENCE_ACTIVE_SCOPE"; scopeType: string; scopeKey: string; label?: string; fileName?: string; meta?: MemoryScopeDetailMeta | null }
  | { type: "SET_MEMORY_PREFERENCE_LOADING"; loading: boolean }
  | { type: "SET_MEMORY_PREFERENCE_ERROR"; error: string }
  | { type: "SET_MEMORY_PREFERENCE_MODE"; mode: MemoryPreferenceMode }
  | { type: "SET_MEMORY_PREFERENCE_MARKDOWN_DRAFT"; markdown: string }
  | { type: "SET_MEMORY_PREFERENCE_RECORDS_DRAFT"; records: MemoryScopeDraftRecord[] }
  | { type: "SET_MEMORY_PREFERENCE_SELECTED_RECORD_ID"; id: string }
  | { type: "SET_MEMORY_PREFERENCE_DIRTY"; dirty: boolean }
  | { type: "SET_MEMORY_PREFERENCE_SAVING"; saving: boolean }
  | { type: "SET_MEMORY_PREFERENCE_SAVE_SUMMARY"; summary: MemoryScopeSaveSummary | null }
  | { type: "SET_MEMORY_PREFERENCE_VALIDATION"; validation: MemoryScopeValidationResult | null }
  | { type: "SET_MEMORY_PREVIEW_DRAFT"; draft: string }
  | { type: "SET_MEMORY_PREVIEW_LOADING"; loading: boolean }
  | { type: "SET_MEMORY_PREVIEW_ERROR"; error: string }
  | { type: "SET_MEMORY_PREVIEW_RESULT"; result: MemoryContextPreviewResponse | null }
  | { type: "SET_MEMORY_PREVIEW_PROMPT_LAYER"; layer: MemoryContextPromptLayer };

export function createInitialMemoryState(): MemoryState {
  return {
    memoryConsoleTab: createDefaultMemoryConsoleTab(),
    memoryInfoLoading: false, memoryInfoError: "", memoryInfoRecords: [], memoryInfoSelectedRecordId: "",
    memoryInfoDetail: null, memoryInfoDetailLoading: false, memoryInfoDetailError: "",
    memoryInfoFilters: createDefaultMemoryInfoFilters(), memoryInfoNextCursor: "", memoryMeta: null,
    memoryPreferenceScopes: [], memoryPreferenceActiveScopeType: "agent", memoryPreferenceActiveScopeKey: "",
    memoryPreferenceLabel: "AGENT", memoryPreferenceFileName: "AGENT.md", memoryPreferenceMeta: null,
    memoryPreferenceLoading: false, memoryPreferenceError: "", memoryPreferenceMode: createDefaultMemoryPreferenceMode(),
    memoryPreferenceMarkdownDraft: "", memoryPreferenceRecordsDraft: [], memoryPreferenceSelectedRecordId: "",
    memoryPreferenceDirty: false, memoryPreferenceSaving: false, memoryPreferenceSaveSummary: null, memoryPreferenceValidation: null,
    memoryPreviewDraft: "", memoryPreviewLoading: false, memoryPreviewError: "", memoryPreviewResult: null, memoryPreviewPromptLayer: "stable",
  };
}

export function reduceMemoryState(state: MemoryState, action: MemoryAction): MemoryState {
  switch (action.type) {
    case "SET_MEMORY_CONSOLE_TAB": return { ...state, memoryConsoleTab: action.tab };
    case "RESET_MEMORY_INFO_SESSION": return {
      ...state,
      memoryInfoLoading: false,
      memoryInfoError: "",
      memoryInfoDetailLoading: false,
      memoryInfoDetailError: "",
      memoryPreferenceLoading: false,
      memoryPreferenceError: "",
      memoryPreferenceSaving: false,
      memoryPreviewDraft: "",
      memoryPreviewLoading: false,
      memoryPreviewError: "",
      memoryPreviewResult: null,
      memoryPreviewPromptLayer: "stable",
    };
    case "SET_MEMORY_INFO_LOADING": return { ...state, memoryInfoLoading: action.loading };
    case "SET_MEMORY_INFO_ERROR": return { ...state, memoryInfoError: action.error };
    case "SET_MEMORY_INFO_FILTERS": return { ...state, memoryInfoFilters: { ...state.memoryInfoFilters, ...action.filters } };
    case "SET_MEMORY_INFO_RECORDS": return { ...state, memoryInfoRecords: action.records, memoryInfoNextCursor: String(action.nextCursor || ""), memoryInfoSelectedRecordId: action.selectedRecordId === undefined ? state.memoryInfoSelectedRecordId : action.selectedRecordId };
    case "SET_MEMORY_INFO_SELECTED_RECORD_ID": return { ...state, memoryInfoSelectedRecordId: action.id };
    case "SET_MEMORY_INFO_DETAIL_LOADING": return { ...state, memoryInfoDetailLoading: action.loading };
    case "SET_MEMORY_INFO_DETAIL_ERROR": return { ...state, memoryInfoDetailError: action.error };
    case "SET_MEMORY_INFO_DETAIL": return { ...state, memoryInfoDetail: action.detail };
    case "SET_MEMORY_META": return { ...state, memoryMeta: action.meta };
    case "SET_MEMORY_PREFERENCE_SCOPES": return { ...state, memoryPreferenceScopes: action.scopes };
    case "SET_MEMORY_PREFERENCE_ACTIVE_SCOPE": return { ...state, memoryPreferenceActiveScopeType: action.scopeType, memoryPreferenceActiveScopeKey: action.scopeKey, memoryPreferenceLabel: action.label ?? state.memoryPreferenceLabel, memoryPreferenceFileName: action.fileName ?? state.memoryPreferenceFileName, memoryPreferenceMeta: action.meta === undefined ? state.memoryPreferenceMeta : action.meta };
    case "SET_MEMORY_PREFERENCE_LOADING": return { ...state, memoryPreferenceLoading: action.loading };
    case "SET_MEMORY_PREFERENCE_ERROR": return { ...state, memoryPreferenceError: action.error };
    case "SET_MEMORY_PREFERENCE_MODE": return { ...state, memoryPreferenceMode: action.mode };
    case "SET_MEMORY_PREFERENCE_MARKDOWN_DRAFT": return { ...state, memoryPreferenceMarkdownDraft: action.markdown };
    case "SET_MEMORY_PREFERENCE_RECORDS_DRAFT": return { ...state, memoryPreferenceRecordsDraft: action.records };
    case "SET_MEMORY_PREFERENCE_SELECTED_RECORD_ID": return { ...state, memoryPreferenceSelectedRecordId: action.id };
    case "SET_MEMORY_PREFERENCE_DIRTY": return { ...state, memoryPreferenceDirty: action.dirty };
    case "SET_MEMORY_PREFERENCE_SAVING": return { ...state, memoryPreferenceSaving: action.saving };
    case "SET_MEMORY_PREFERENCE_SAVE_SUMMARY": return { ...state, memoryPreferenceSaveSummary: action.summary };
    case "SET_MEMORY_PREFERENCE_VALIDATION": return { ...state, memoryPreferenceValidation: action.validation };
    case "SET_MEMORY_PREVIEW_DRAFT": return { ...state, memoryPreviewDraft: action.draft };
    case "SET_MEMORY_PREVIEW_LOADING": return { ...state, memoryPreviewLoading: action.loading };
    case "SET_MEMORY_PREVIEW_ERROR": return { ...state, memoryPreviewError: action.error };
    case "SET_MEMORY_PREVIEW_RESULT": return { ...state, memoryPreviewResult: action.result };
    case "SET_MEMORY_PREVIEW_PROMPT_LAYER": return { ...state, memoryPreviewPromptLayer: action.layer };
  }
}
