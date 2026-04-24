import type {
	AppState,
	AgentEvent,
	Message,
} from "@/app/state/types";
import { MAX_DEBUG_LINES, MAX_EVENTS } from "@/app/state/constants";
import { upsertChatSummary } from "@/features/chats/lib/chatSummary";
import { normalizeThemeMode } from "@/shared/styles/theme";
import type { AppAction } from "@/app/state/actions";
import {
	addSetValue,
	buildConversationResetState,
	deleteMapValue,
	patchActiveAwaiting,
	removeSetValue,
	setMapValue,
	toggleSetValue,
	upsertArtifact,
} from "@/app/state/reducerHelpers";

export type { AppAction } from "@/app/state/actions";

export function appReducer(state: AppState, action: AppAction): AppState {
	switch (action.type) {
		case "SET_AGENTS":
			return { ...state, agents: action.agents };
		case "SET_TEAMS":
			return { ...state, teams: action.teams };
		case "SET_CHATS":
			return { ...state, chats: action.chats };
		case "START_SIDEBAR_REQUEST":
			return {
				...state,
				sidebarPendingRequestCount: state.sidebarPendingRequestCount + 1,
			};
		case "FINISH_SIDEBAR_REQUEST":
			return {
				...state,
				sidebarPendingRequestCount: Math.max(
					0,
					state.sidebarPendingRequestCount - 1,
				),
			};
		case "UPSERT_CHAT":
			return {
				...state,
				chats: upsertChatSummary(state.chats, action.chat),
			};
		case "SET_CHAT_ID":
			return { ...state, chatId: action.chatId };
		case "SET_RUN_ID":
			return { ...state, runId: action.runId };
		case "SET_REQUEST_ID":
			return { ...state, requestId: action.requestId };
		case "SET_STREAMING":
			return { ...state, streaming: action.streaming };
		case "SET_ABORT_CONTROLLER":
			return { ...state, abortController: action.controller };
		case "PUSH_EVENT": {
			const events =
				state.events.length >= MAX_EVENTS
					? [...state.events.slice(-Math.floor(MAX_EVENTS * 0.8)), action.event]
					: [...state.events, action.event];
			return { ...state, events };
		}
		case "CLEAR_EVENTS":
			return { ...state, events: [] };
		case "APPEND_DEBUG": {
			const debugLines =
				state.debugLines.length >= MAX_DEBUG_LINES
					? [
							...state.debugLines.slice(-Math.floor(MAX_DEBUG_LINES * 0.8)),
							action.line,
						]
					: [...state.debugLines, action.line];
			return { ...state, debugLines };
		}
		case "CLEAR_DEBUG":
			return { ...state, debugLines: [] };
		case "UPSERT_ARTIFACT":
			return {
				...state,
				artifacts: upsertArtifact(state.artifacts, action.artifact),
			};
		case "SET_ARTIFACT_EXPANDED":
			return { ...state, artifactExpanded: action.expanded };
		case "SET_ARTIFACT_MANUAL_OVERRIDE":
			return { ...state, artifactManualOverride: action.override };
		case "SET_ARTIFACT_AUTO_COLLAPSE_TIMER":
			return { ...state, artifactAutoCollapseTimer: action.timer };
		case "SET_PLAN":
			return { ...state, plan: action.plan };
		case "SET_PLAN_EXPANDED":
			return { ...state, planExpanded: action.expanded };
		case "SET_PLAN_MANUAL_OVERRIDE":
			return { ...state, planManualOverride: action.override };
		case "SET_TASK_ITEM_META": {
			return {
				...state,
				taskItemsById: setMapValue(state.taskItemsById, action.taskId, action.task),
			};
		}
		case "SET_TASK_GROUP_META": {
			return {
				...state,
				taskGroupsById: setMapValue(state.taskGroupsById, action.groupId, action.group),
			};
		}
		case "SET_AGENT_GROUP_ADD_TASK": {
			const agentGroupsByGroupId = new Map(state.agentGroupsByGroupId);
			agentGroupsByGroupId.set(action.groupId, action.group);
			const groupIdByTaskId = new Map(state.groupIdByTaskId);
			for (const taskId of action.group.taskIds) {
				groupIdByTaskId.set(taskId, action.groupId);
			}
			const groupIdByMainToolId = new Map(state.groupIdByMainToolId);
			if (action.group.mainToolId) {
				groupIdByMainToolId.set(action.group.mainToolId, action.groupId);
			}
			return { ...state, agentGroupsByGroupId, groupIdByTaskId, groupIdByMainToolId };
		}
		case "TOGGLE_AGENT_GROUP_EXPANDED": {
			const nodeId = `agent_group_${action.groupId}`;
			const existing = state.timelineNodes.get(nodeId);
			if (!existing || existing.kind !== "agent-group") {
				return state;
			}
			const timelineNodes = new Map(state.timelineNodes);
			timelineNodes.set(nodeId, { ...existing, expanded: !existing.expanded });
			return { ...state, timelineNodes };
		}
		case "ADD_ACTIVE_TASK_ID": {
			return { ...state, activeTaskIds: addSetValue(state.activeTaskIds, action.taskId) };
		}
		case "REMOVE_ACTIVE_TASK_ID": {
			return { ...state, activeTaskIds: removeSetValue(state.activeTaskIds, action.taskId) };
		}
		case "SET_PLAN_CURRENT_RUNNING_TASK_ID":
			return { ...state, planCurrentRunningTaskId: action.taskId };
		case "SET_PLAN_LAST_TOUCHED_TASK_ID":
			return { ...state, planLastTouchedTaskId: action.taskId };
		case "SET_PLAN_RUNTIME": {
			return {
				...state,
				planRuntimeByTaskId: setMapValue(
					state.planRuntimeByTaskId,
					action.taskId,
					action.runtime,
				),
			};
		}
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
		case "SET_CHAT_FILTER":
			return { ...state, chatFilter: action.filter };
		case "SET_CONVERSATION_MODE":
			return { ...state, conversationMode: action.mode };
		case "SET_WORKER_SELECTION_KEY":
			return { ...state, workerSelectionKey: action.workerKey };
		case "SET_WORKER_ROWS": {
			const workerIndexByKey = new Map(
				action.rows.map((row) => [row.key, row]),
			);
			const workerSelectionKey = workerIndexByKey.has(
				state.workerSelectionKey,
			)
				? state.workerSelectionKey
				: "";
			return {
				...state,
				workerRows: action.rows,
				workerIndexByKey,
				workerSelectionKey,
			};
		}
		case "SET_WORKER_RELATED_CHATS":
			return { ...state, workerRelatedChats: action.chats };
		case "SET_WORKER_CHAT_PANEL_COLLAPSED":
			return { ...state, workerChatPanelCollapsed: action.collapsed };
		case "SET_DESKTOP_DEBUG_SIDEBAR_ENABLED":
			return { ...state, desktopDebugSidebarEnabled: action.enabled };
		case "SET_PENDING_NEW_CHAT_AGENT_KEY":
			return { ...state, pendingNewChatAgentKey: action.agentKey };
		case "SET_WORKER_PRIORITY_KEY":
			return { ...state, workerPriorityKey: action.workerKey };
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
		case "SET_AUDIO_MUTED":
			return { ...state, audioMuted: action.muted };
		case "SET_TTS_DEBUG_STATUS":
			return { ...state, ttsDebugStatus: action.status };
		case "SET_PLANNING_MODE":
			return { ...state, planningMode: action.enabled };
		case "SET_INPUT_MODE":
			return { ...state, inputMode: action.mode };
		case "PATCH_VOICE_CHAT":
			return {
				...state,
				voiceChat: {
					...state.voiceChat,
					...action.patch,
				},
			};
		case "SET_PLAN_AUTO_COLLAPSE_TIMER":
			return { ...state, planAutoCollapseTimer: action.timer };
		case "SET_STEER_DRAFT":
			return { ...state, steerDraft: action.draft };
		case "ENQUEUE_PENDING_STEER":
			return {
				...state,
				pendingSteers: [...state.pendingSteers, action.steer],
			};
		case "REMOVE_PENDING_STEER":
			return {
				...state,
				pendingSteers: state.pendingSteers.filter(
					(steer) => steer.steerId !== action.steerId,
				),
			};
		case "CLEAR_PENDING_STEERS":
			if (state.pendingSteers.length === 0) {
				return state;
			}
			return { ...state, pendingSteers: [] };
		case "TOGGLE_RUN_DOWNVOTE": {
			return {
				...state,
				downvotedRunKeys: toggleSetValue(state.downvotedRunKeys, action.runKey),
			};
		}
		case "SET_MENTION_OPEN":
			return { ...state, mentionOpen: action.open };
		case "SET_MENTION_SUGGESTIONS":
			return { ...state, mentionSuggestions: action.agents };
		case "SET_MENTION_ACTIVE_INDEX":
			return { ...state, mentionActiveIndex: action.index };
		case "SET_ACTIVE_FRONTEND_TOOL":
			return { ...state, activeFrontendTool: action.tool };
		case "SET_ACTIVE_AWAITING":
			return { ...state, activeAwaiting: action.awaiting };
		case "PATCH_ACTIVE_AWAITING":
			if (!state.activeAwaiting) {
				return state;
			}
			return {
				...state,
				activeAwaiting: patchActiveAwaiting(state.activeAwaiting, action.patch),
			};
		case "CLEAR_ACTIVE_AWAITING":
			if (!state.activeAwaiting) {
				return state;
			}
			return { ...state, activeAwaiting: null };
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
		case "SET_TIMELINE_NODE": {
			return {
				...state,
				timelineNodes: setMapValue(state.timelineNodes, action.id, action.node),
			};
		}
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
		case "SET_TOOL_STATE": {
			return {
				...state,
				toolStates: setMapValue(state.toolStates, action.key, action.state),
			};
		}
		case "SET_PENDING_TOOL": {
			return {
				...state,
				pendingTools: setMapValue(state.pendingTools, action.key, action.tool),
			};
		}
		case "SET_ACTION_STATE": {
			return {
				...state,
				actionStates: setMapValue(state.actionStates, action.key, action.state),
			};
		}
		case "ADD_EXECUTED_ACTION_ID": {
			return {
				...state,
				executedActionIds: addSetValue(state.executedActionIds, action.actionId),
			};
		}
		case "SET_EVENT_POPOVER":
			return {
				...state,
				eventPopoverIndex: action.index,
				eventPopoverEventRef: action.event,
				eventPopoverAnchor: action.anchor ?? null,
			};
		case "SET_MESSAGE": {
			return {
				...state,
				messagesById: setMapValue(state.messagesById, action.id, action.message),
			};
		}
		case "SET_MESSAGE_ORDER":
			return { ...state, messageOrder: action.order };
		case "SET_CONTENT_NODE_BY_ID": {
			return {
				...state,
				contentNodeById: setMapValue(
					state.contentNodeById,
					action.contentId,
					action.nodeId,
				),
			};
		}
		case "SET_REASONING_NODE_BY_ID": {
			return {
				...state,
				reasoningNodeById: setMapValue(
					state.reasoningNodeById,
					action.reasoningId,
					action.nodeId,
				),
			};
		}
		case "SET_REASONING_COLLAPSE_TIMER": {
			return {
				...state,
				reasoningCollapseTimers: setMapValue(
					state.reasoningCollapseTimers,
					action.reasoningId,
					action.timer,
				),
			};
		}
		case "CLEAR_REASONING_COLLAPSE_TIMER": {
			return {
				...state,
				reasoningCollapseTimers: deleteMapValue(
					state.reasoningCollapseTimers,
					action.reasoningId,
				),
			};
		}
		case "SET_TOOL_NODE_BY_ID": {
			return {
				...state,
				toolNodeById: setMapValue(state.toolNodeById, action.toolId, action.nodeId),
			};
		}
		case "SET_ACTIVE_REASONING_KEY":
			return { ...state, activeReasoningKey: action.key };
		case "SET_CHAT_AGENT_BY_ID": {
			return {
				...state,
				chatAgentById: setMapValue(
					state.chatAgentById,
					action.chatId,
					action.agentKey,
				),
			};
		}
		case "INCREMENT_TIMELINE_COUNTER":
			return { ...state, timelineCounter: state.timelineCounter + 1 };
		case "RESET_CONVERSATION":
			return buildConversationResetState(state);
		case "RESET_ACTIVE_CONVERSATION":
			return buildConversationResetState(state, {
				preserveWorkerContext: true,
			});
		case "BATCH_UPDATE":
			return { ...state, ...action.updates };
		default:
			return state;
	}
}
