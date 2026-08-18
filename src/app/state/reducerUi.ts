import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";
import { normalizeThemeMode } from "@/shared/styles/theme";
import { persistTerminalDockOpen } from "@/features/terminal/lib/terminalDockPersistence";
import { getViewerTargetKey } from "@/features/viewers/lib/viewerTarget";

export function reduceUiState(
	state: AppState,
	action: AppAction,
): AppState | null {
	switch (action.type) {
		case "RESET_MEMORY_INFO_SESSION":
			return {
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
		case "SET_MEMORY_META":
			return { ...state, memoryMeta: action.meta };
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
		case "SET_MEMORY_PREVIEW_DRAFT":
			return { ...state, memoryPreviewDraft: action.draft };
		case "SET_MEMORY_PREVIEW_LOADING":
			return { ...state, memoryPreviewLoading: action.loading };
		case "SET_MEMORY_PREVIEW_ERROR":
			return { ...state, memoryPreviewError: action.error };
		case "SET_MEMORY_PREVIEW_RESULT":
			return { ...state, memoryPreviewResult: action.result };
		case "SET_MEMORY_PREVIEW_PROMPT_LAYER":
			return { ...state, memoryPreviewPromptLayer: action.layer };
		case "SET_LEFT_DRAWER_OPEN":
			return { ...state, leftDrawerOpen: action.open };
		case "SET_TERMINAL_DOCK_OPEN":
			persistTerminalDockOpen(action.open);
			return { ...state, terminalDockOpen: action.open };
		case "REFRESH_WEB_PREVIEW": {
			if (!state.webPreviews.some((preview) => preview.url === action.url)) {
				return state;
			}
			const nextRevisions = new Map(state.webPreviewRefreshRevisionByUrl);
			nextRevisions.set(
				action.url,
				(nextRevisions.get(action.url) ?? 0) + 1,
			);
			return {
				...state,
				webPreviewRefreshRevisionByUrl: nextRevisions,
			};
		}
		case "OPEN_RIGHT_SIDEBAR": {
			const hasViewerTarget = Object.prototype.hasOwnProperty.call(action, "viewerTarget");
			const hasSourceDetail = Object.prototype.hasOwnProperty.call(action, "sourceDetail");
			const hasPlanningPreview = Object.prototype.hasOwnProperty.call(action, "planningPreview");
			const hasWebPreview = Object.prototype.hasOwnProperty.call(action, "webPreview");
			const hasActiveWebPreviewUrl = Object.prototype.hasOwnProperty.call(
				action,
				"activeWebPreviewUrl",
			);
			const removeViewerKey = Object.prototype.hasOwnProperty.call(action, "removeViewerKey")
				? action.removeViewerKey
				: undefined;
			const removePlanningPreviewNodeId = Object.prototype.hasOwnProperty.call(action, "removePlanningPreviewNodeId")
				? action.removePlanningPreviewNodeId
				: undefined;
			const removeWebPreviewUrl = Object.prototype.hasOwnProperty.call(action, "removeWebPreviewUrl")
				? action.removeWebPreviewUrl
				: undefined;
			const hasActiveViewerKey = Object.prototype.hasOwnProperty.call(
				action,
				"activeViewerKey",
			);
			const hasActivePlanningPreviewNodeId = Object.prototype.hasOwnProperty.call(
				action,
				"activePlanningPreviewNodeId",
			);
			let nextViewerTabs = state.viewerTabs;
			if (removeViewerKey) {
				nextViewerTabs = nextViewerTabs.filter(
					(target) => getViewerTargetKey(target) !== removeViewerKey,
				);
			} else {
				const incomingTarget = hasViewerTarget ? action.viewerTarget : undefined;
				if (incomingTarget) {
					const incomingKey = getViewerTargetKey(incomingTarget);
					const existingIndex = nextViewerTabs.findIndex(
						(target) => getViewerTargetKey(target) === incomingKey,
					);
					if (existingIndex >= 0) {
						nextViewerTabs = [...nextViewerTabs];
						nextViewerTabs[existingIndex] = incomingTarget;
					} else {
						nextViewerTabs = [...nextViewerTabs, incomingTarget];
					}
				} else if (hasViewerTarget) {
					nextViewerTabs = [];
				}
			}
			let nextActiveViewerKey = state.activeViewerKey;
			if (removeViewerKey) {
				if (nextActiveViewerKey === removeViewerKey) {
					const lastTarget = nextViewerTabs[nextViewerTabs.length - 1];
					nextActiveViewerKey = lastTarget ? getViewerTargetKey(lastTarget) : "";
				}
			} else {
				const incomingTarget = hasViewerTarget ? action.viewerTarget : undefined;
				if (incomingTarget) {
					nextActiveViewerKey = getViewerTargetKey(incomingTarget);
				} else if (hasActiveViewerKey) {
					nextActiveViewerKey = String(action.activeViewerKey || "");
				}
			}
			let nextPlanningPreviews = state.planningPreviews;
			if (removePlanningPreviewNodeId) {
				nextPlanningPreviews = nextPlanningPreviews.filter(
					(p) => p.nodeId !== removePlanningPreviewNodeId,
				);
			} else {
				const incomingPlanning = hasPlanningPreview ? action.planningPreview : undefined;
				if (incomingPlanning) {
					const existingIndex = nextPlanningPreviews.findIndex(
						(p) => p.nodeId === incomingPlanning.nodeId,
					);
					if (existingIndex >= 0) {
						nextPlanningPreviews = nextPlanningPreviews
							.filter((_, i) => i !== existingIndex)
							.concat(incomingPlanning);
					} else {
						nextPlanningPreviews = [...nextPlanningPreviews, incomingPlanning];
					}
				} else if (hasPlanningPreview) {
					nextPlanningPreviews = [];
				}
			}
			let nextActivePlanningPreviewNodeId = state.activePlanningPreviewNodeId;
			if (removePlanningPreviewNodeId) {
				if (nextActivePlanningPreviewNodeId === removePlanningPreviewNodeId) {
					nextActivePlanningPreviewNodeId =
						nextPlanningPreviews[nextPlanningPreviews.length - 1]?.nodeId || "";
				}
			} else {
				const incomingPlanning = hasPlanningPreview ? action.planningPreview : undefined;
				if (incomingPlanning) {
					nextActivePlanningPreviewNodeId = incomingPlanning.nodeId;
				} else if (hasActivePlanningPreviewNodeId) {
					nextActivePlanningPreviewNodeId = String(action.activePlanningPreviewNodeId || "");
				}
			}
			let nextWebPreviews = state.webPreviews;
			let nextActiveWebPreviewUrl = state.activeWebPreviewUrl;
			let nextWebPreviewRefreshRevisionByUrl =
				state.webPreviewRefreshRevisionByUrl;
			if (removeWebPreviewUrl) {
				nextWebPreviews = nextWebPreviews.filter(
					(preview) => preview.url !== removeWebPreviewUrl,
				);
				if (nextWebPreviewRefreshRevisionByUrl.has(removeWebPreviewUrl)) {
					nextWebPreviewRefreshRevisionByUrl = new Map(
						nextWebPreviewRefreshRevisionByUrl,
					);
					nextWebPreviewRefreshRevisionByUrl.delete(removeWebPreviewUrl);
				}
				if (nextActiveWebPreviewUrl === removeWebPreviewUrl) {
					nextActiveWebPreviewUrl =
						nextWebPreviews[nextWebPreviews.length - 1]?.url || "";
				}
			} else {
				const incomingWebPreview = hasWebPreview
					? action.webPreview
					: undefined;
				if (incomingWebPreview) {
					const existingIndex = nextWebPreviews.findIndex(
						(preview) => preview.url === incomingWebPreview.url,
					);
					if (existingIndex >= 0) {
						nextWebPreviews = [...nextWebPreviews];
						nextWebPreviews[existingIndex] = incomingWebPreview;
					} else {
						nextWebPreviews = [...nextWebPreviews, incomingWebPreview];
					}
					nextActiveWebPreviewUrl = incomingWebPreview.url;
				} else if (hasWebPreview) {
					nextWebPreviews = [];
					nextActiveWebPreviewUrl = "";
				}
			}
			if (hasActiveWebPreviewUrl) {
				const requestedActiveUrl = String(action.activeWebPreviewUrl || "");
				nextActiveWebPreviewUrl = nextWebPreviews.some(
					(preview) => preview.url === requestedActiveUrl,
				)
					? requestedActiveUrl
					: nextActiveWebPreviewUrl;
			}
			return {
				...state,
				rightSidebarOpen: true,
				rightSidebarOpenTab: action.tab ?? null,
				viewerTabs: nextViewerTabs,
				planningPreviews: nextPlanningPreviews,
				webPreviews: nextWebPreviews,
				webPreviewRefreshRevisionByUrl:
					nextWebPreviewRefreshRevisionByUrl,
				activeWebPreviewUrl: nextActiveWebPreviewUrl,
				activeSourceDetail: hasSourceDetail
					? action.sourceDetail ?? null
					: state.activeSourceDetail,
				activeViewerKey: nextActiveViewerKey,
				activePlanningPreviewNodeId: nextActivePlanningPreviewNodeId,
			};
		}
		case "CLOSE_RIGHT_SIDEBAR":
			return {
				...state,
				rightSidebarOpen: false,
				rightSidebarOpenTab: null,
				artifactExpanded: false,
				artifactManualOverride: false,
				activeSourceDetail: null,
			};
		case "SET_THEME_MODE":
			return {
				...state,
				themeMode: normalizeThemeMode(action.themeMode),
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
		case "SET_PLANNING_MODE": {
			const next = { ...state, planningMode: action.enabled };
			if (action.persist !== false) {
				next.planningModeByChatId = {
					...state.planningModeByChatId,
					[action.chatId]: action.enabled,
				};
			}
			return next;
		}
		case "SET_EDITING_MODE":
			return { ...state, editingMode: action.enabled };
		case "SET_USAGE_SNAPSHOT":
			return { ...state, usageSnapshot: action.snapshot };
		case "SET_USAGE_POPOVER_OPEN":
			return { ...state, usagePopoverOpen: action.open };
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
