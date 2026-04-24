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
