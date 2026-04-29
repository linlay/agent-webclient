import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";
import { normalizeThemeMode } from "@/shared/styles/theme";

export function reduceUiState(
	state: AppState,
	action: AppAction,
): AppState | null {
	switch (action.type) {
		case "SET_SETTINGS_OPEN":
			return { ...state, settingsOpen: action.open };
		case "SET_MEMORY_INFO_OPEN":
			return {
				...state,
				memoryInfoOpen: action.open,
				memoryConsoleTab: action.open ? "records" : state.memoryConsoleTab,
				memoryInfoLoading: action.open ? state.memoryInfoLoading : false,
				memoryInfoError: action.open ? state.memoryInfoError : "",
				memoryInfoDetailLoading: action.open
					? state.memoryInfoDetailLoading
					: false,
				memoryInfoDetailError: action.open ? state.memoryInfoDetailError : "",
				memoryPreferenceLoading: action.open
					? state.memoryPreferenceLoading
					: false,
				memoryPreferenceError: action.open
					? state.memoryPreferenceError
					: "",
				memoryPreferenceSaving: action.open
					? state.memoryPreferenceSaving
					: false,
			};
		case "SET_MEMORY_CONSOLE_TAB":
			return { ...state, memoryConsoleTab: action.tab };
		case "SET_MEMORY_INFO_LOADING":
			return { ...state, memoryInfoLoading: action.loading };
		case "SET_MEMORY_INFO_ERROR":
			return { ...state, memoryInfoError: action.error };
		case "SET_MEMORY_INFO_FILTERS":
			return {
				...state,
				memoryInfoFilters: {
					...state.memoryInfoFilters,
					...action.filters,
				},
			};
		case "SET_MEMORY_INFO_RECORDS":
			return {
				...state,
				memoryInfoRecords: action.records,
				memoryInfoNextCursor: String(action.nextCursor || ""),
				memoryInfoSelectedRecordId:
					action.selectedRecordId !== undefined
						? action.selectedRecordId
						: state.memoryInfoSelectedRecordId,
			};
		case "SET_MEMORY_INFO_SELECTED_RECORD_ID":
			return { ...state, memoryInfoSelectedRecordId: action.id };
		case "SET_MEMORY_INFO_DETAIL_LOADING":
			return { ...state, memoryInfoDetailLoading: action.loading };
		case "SET_MEMORY_INFO_DETAIL_ERROR":
			return { ...state, memoryInfoDetailError: action.error };
		case "SET_MEMORY_INFO_DETAIL":
			return { ...state, memoryInfoDetail: action.detail };
		case "SET_MEMORY_PREFERENCE_SCOPES":
			return { ...state, memoryPreferenceScopes: action.scopes };
		case "SET_MEMORY_PREFERENCE_ACTIVE_SCOPE":
			return {
				...state,
				memoryPreferenceActiveScopeType: action.scopeType,
				memoryPreferenceActiveScopeKey: action.scopeKey,
				memoryPreferenceLabel:
					action.label ?? state.memoryPreferenceLabel,
				memoryPreferenceFileName:
					action.fileName ?? state.memoryPreferenceFileName,
				memoryPreferenceMeta:
					action.meta === undefined
						? state.memoryPreferenceMeta
						: action.meta,
			};
		case "SET_MEMORY_PREFERENCE_LOADING":
			return { ...state, memoryPreferenceLoading: action.loading };
		case "SET_MEMORY_PREFERENCE_ERROR":
			return { ...state, memoryPreferenceError: action.error };
		case "SET_MEMORY_PREFERENCE_MODE":
			return { ...state, memoryPreferenceMode: action.mode };
		case "SET_MEMORY_PREFERENCE_MARKDOWN_DRAFT":
			return { ...state, memoryPreferenceMarkdownDraft: action.markdown };
		case "SET_MEMORY_PREFERENCE_RECORDS_DRAFT":
			return { ...state, memoryPreferenceRecordsDraft: action.records };
		case "SET_MEMORY_PREFERENCE_SELECTED_RECORD_ID":
			return { ...state, memoryPreferenceSelectedRecordId: action.id };
		case "SET_MEMORY_PREFERENCE_DIRTY":
			return { ...state, memoryPreferenceDirty: action.dirty };
		case "SET_MEMORY_PREFERENCE_SAVING":
			return { ...state, memoryPreferenceSaving: action.saving };
		case "SET_MEMORY_PREFERENCE_SAVE_SUMMARY":
			return { ...state, memoryPreferenceSaveSummary: action.summary };
		case "SET_MEMORY_PREFERENCE_VALIDATION":
			return { ...state, memoryPreferenceValidation: action.validation };
		case "SET_LEFT_DRAWER_OPEN":
			return { ...state, leftDrawerOpen: action.open };
		case "SET_TERMINAL_DOCK_OPEN":
			return { ...state, terminalDockOpen: action.open };
		case "OPEN_ATTACHMENT_PREVIEW":
			return { ...state, attachmentPreview: action.preview };
		case "CLOSE_ATTACHMENT_PREVIEW":
			if (!state.attachmentPreview) {
				return state;
			}
			return { ...state, attachmentPreview: null };
		case "SET_THEME_MODE":
			return {
				...state,
				themeMode: normalizeThemeMode(action.themeMode),
			};
		case "SET_TRANSPORT_MODE":
			return {
				...state,
				transportMode: action.mode,
				wsStatus: "disconnected",
				wsErrorMessage: "",
			};
		case "SET_WS_STATUS":
			return {
				...state,
				wsStatus: action.status,
				wsErrorMessage:
					action.status === "connected" || action.status === "connecting"
						? ""
						: state.wsErrorMessage,
			};
		case "SET_WS_ERROR_MESSAGE":
			return { ...state, wsErrorMessage: String(action.message || "") };
		case "SET_ACCESS_TOKEN":
			return {
				...state,
				accessToken: action.token,
				wsErrorMessage: "",
			};
		case "SET_PLANNING_MODE":
			return { ...state, planningMode: action.enabled };
		case "SET_MENTION_OPEN":
			return { ...state, mentionOpen: action.open };
		case "SET_MENTION_SUGGESTIONS":
			return { ...state, mentionSuggestions: action.agents };
		case "SET_MENTION_ACTIVE_INDEX":
			return { ...state, mentionActiveIndex: action.index };
		case "SHOW_COMMAND_STATUS_OVERLAY":
			return {
				...state,
				commandStatusOverlay: {
					visible: true,
					commandType: action.commandType,
					phase: action.phase,
					text: action.text,
					timer: null,
				},
			};
		case "SET_COMMAND_STATUS_OVERLAY_TIMER":
			return {
				...state,
				commandStatusOverlay: {
					...state.commandStatusOverlay,
					timer: action.timer,
				},
			};
		case "HIDE_COMMAND_STATUS_OVERLAY":
			if (!state.commandStatusOverlay.visible && !state.commandStatusOverlay.timer) {
				return state;
			}
			return {
				...state,
				commandStatusOverlay: {
					visible: false,
					commandType: null,
					phase: "success",
					text: "",
					timer: null,
				},
			};
		case "OPEN_COMMAND_MODAL":
			return {
				...state,
				commandModal: {
					open: true,
					type: action.modal.type,
					searchText: action.modal.searchText ?? "",
					historySearch: action.modal.historySearch ?? "",
					activeIndex: action.modal.activeIndex ?? 0,
					scope: action.modal.scope ?? "all",
					focusArea: action.modal.focusArea ?? "search",
					scheduleTask: action.modal.scheduleTask ?? "",
					scheduleRule: action.modal.scheduleRule ?? "",
				},
			};
		case "PATCH_COMMAND_MODAL":
			return {
				...state,
				commandModal: {
					...state.commandModal,
					...action.modal,
				},
			};
		case "CLOSE_COMMAND_MODAL":
			if (!state.commandModal.open && !state.commandModal.type) {
				return state;
			}
			return {
				...state,
				commandModal: {
					open: false,
					type: null,
					searchText: "",
					historySearch: "",
					activeIndex: 0,
					scope: "all",
					focusArea: "search",
					scheduleTask: "",
					scheduleRule: "",
				},
			};
		case "SET_EVENT_POPOVER":
			return {
				...state,
				eventPopoverIndex: action.index,
				eventPopoverEventRef: action.event,
				eventPopoverAnchor: action.anchor ?? null,
			};
		default:
			return null;
	}
}
