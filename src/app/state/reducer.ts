import type {
	AppState,
	AgentEvent,
	Chat,
	Agent,
	Message,
	TimelineNode,
	ToolState,
	PendingTool,
	PublishedArtifact,
	PlanRuntime,
	Plan,
	TaskGroupMeta,
	TaskItemMeta,
	AgentGroup,
	ActiveFrontendTool,
	ActionState,
	Team,
	WorkerRow,
	WorkerConversationRow,
	UiTimerHandle,
	PendingSteer,
	VoiceChatState,
	TtsVoiceBlock,
	ActiveAwaiting,
} from "@/app/state/types";
import type { LayoutMode } from "@/app/state/constants";
import { MAX_DEBUG_LINES, MAX_EVENTS } from "@/app/state/constants";
import type { AttachmentPreviewState } from "@/features/artifacts/lib/attachmentPreview";
import { upsertChatSummary } from "@/features/chats/lib/chatSummary";
import { normalizeThemeMode } from "@/shared/styles/theme";

export type AppAction =
	| { type: "SET_AGENTS"; agents: Agent[] }
	| { type: "SET_TEAMS"; teams: Team[] }
	| { type: "SET_CHATS"; chats: Chat[] }
	| { type: "START_SIDEBAR_REQUEST" }
	| { type: "FINISH_SIDEBAR_REQUEST" }
	| { type: "UPSERT_CHAT"; chat: Partial<Chat> & Pick<Chat, "chatId"> }
	| { type: "SET_CHAT_ID"; chatId: string }
	| { type: "SET_RUN_ID"; runId: string }
	| { type: "SET_REQUEST_ID"; requestId: string }
	| { type: "SET_STREAMING"; streaming: boolean }
	| { type: "SET_ABORT_CONTROLLER"; controller: AbortController | null }
	| { type: "PUSH_EVENT"; event: AgentEvent }
	| { type: "CLEAR_EVENTS" }
	| { type: "APPEND_DEBUG"; line: string }
	| { type: "CLEAR_DEBUG" }
	| { type: "UPSERT_ARTIFACT"; artifact: PublishedArtifact }
	| { type: "SET_ARTIFACT_EXPANDED"; expanded: boolean }
	| { type: "SET_ARTIFACT_MANUAL_OVERRIDE"; override: boolean | null }
	| { type: "SET_ARTIFACT_AUTO_COLLAPSE_TIMER"; timer: UiTimerHandle | null }
	| { type: "SET_PLAN"; plan: Plan | null }
	| { type: "SET_PLAN_EXPANDED"; expanded: boolean }
	| { type: "SET_PLAN_MANUAL_OVERRIDE"; override: boolean | null }
	| { type: "SET_TASK_ITEM_META"; taskId: string; task: TaskItemMeta }
	| { type: "SET_TASK_GROUP_META"; groupId: string; group: TaskGroupMeta }
	| { type: "SET_AGENT_GROUP_ADD_TASK"; groupId: string; group: AgentGroup }
	| { type: "TOGGLE_AGENT_GROUP_EXPANDED"; groupId: string }
	| { type: "ADD_ACTIVE_TASK_ID"; taskId: string }
	| { type: "REMOVE_ACTIVE_TASK_ID"; taskId: string }
	| { type: "SET_PLAN_CURRENT_RUNNING_TASK_ID"; taskId: string }
	| { type: "SET_PLAN_LAST_TOUCHED_TASK_ID"; taskId: string }
	| { type: "SET_PLAN_RUNTIME"; taskId: string; runtime: PlanRuntime }
	| { type: "SET_SETTINGS_OPEN"; open: boolean }
	| { type: "SET_LEFT_DRAWER_OPEN"; open: boolean }
	| { type: "SET_RIGHT_DRAWER_OPEN"; open: boolean }
	| { type: "SET_TERMINAL_DOCK_OPEN"; open: boolean }
	| { type: "SET_LAYOUT_MODE"; mode: LayoutMode }
	| { type: "OPEN_ATTACHMENT_PREVIEW"; preview: AttachmentPreviewState }
	| { type: "CLOSE_ATTACHMENT_PREVIEW" }
	| { type: "SET_CHAT_FILTER"; filter: string }
	| { type: "SET_CONVERSATION_MODE"; mode: "chat" | "worker" }
	| { type: "SET_WORKER_SELECTION_KEY"; workerKey: string }
	| { type: "SET_WORKER_ROWS"; rows: WorkerRow[] }
	| { type: "SET_WORKER_RELATED_CHATS"; chats: WorkerConversationRow[] }
	| { type: "SET_WORKER_CHAT_PANEL_COLLAPSED"; collapsed: boolean }
	| { type: "SET_DESKTOP_DEBUG_SIDEBAR_ENABLED"; enabled: boolean }
	| { type: "SET_PENDING_NEW_CHAT_AGENT_KEY"; agentKey: string }
	| { type: "SET_WORKER_PRIORITY_KEY"; workerKey: string }
	| { type: "SET_THEME_MODE"; themeMode: AppState["themeMode"] }
	| { type: "SET_TRANSPORT_MODE"; mode: AppState["transportMode"] }
	| { type: "SET_WS_STATUS"; status: AppState["wsStatus"] }
	| { type: "SET_WS_ERROR_MESSAGE"; message: AppState["wsErrorMessage"] }
	| { type: "SET_ACCESS_TOKEN"; token: string }
	| { type: "SET_AUDIO_MUTED"; muted: boolean }
	| { type: "SET_TTS_DEBUG_STATUS"; status: string }
	| { type: "SET_PLANNING_MODE"; enabled: boolean }
	| { type: "SET_INPUT_MODE"; mode: AppState["inputMode"] }
	| { type: "PATCH_VOICE_CHAT"; patch: Partial<VoiceChatState> }
	| { type: "SET_PLAN_AUTO_COLLAPSE_TIMER"; timer: UiTimerHandle | null }
	| { type: "SET_STEER_DRAFT"; draft: string }
	| { type: "ENQUEUE_PENDING_STEER"; steer: PendingSteer }
	| { type: "REMOVE_PENDING_STEER"; steerId: string }
	| { type: "CLEAR_PENDING_STEERS" }
	| { type: "TOGGLE_RUN_DOWNVOTE"; runKey: string }
	| { type: "SET_MENTION_OPEN"; open: boolean }
	| { type: "SET_MENTION_SUGGESTIONS"; agents: Agent[] }
	| { type: "SET_MENTION_ACTIVE_INDEX"; index: number }
	| { type: "SET_ACTIVE_FRONTEND_TOOL"; tool: ActiveFrontendTool | null }
	| { type: "SET_ACTIVE_AWAITING"; awaiting: ActiveAwaiting | null }
	| {
			type: "PATCH_ACTIVE_AWAITING";
			patch: {
				resolvedByOther?: boolean;
				loading?: boolean;
				loadError?: string;
				viewportHtml?: string;
			};
	  }
	| { type: "CLEAR_ACTIVE_AWAITING" }
	| {
			type: "SHOW_COMMAND_STATUS_OVERLAY";
			commandType: NonNullable<AppState["commandStatusOverlay"]["commandType"]>;
			phase: AppState["commandStatusOverlay"]["phase"];
			text: string;
	  }
	| { type: "SET_COMMAND_STATUS_OVERLAY_TIMER"; timer: UiTimerHandle | null }
	| { type: "HIDE_COMMAND_STATUS_OVERLAY" }
	| {
			type: "OPEN_COMMAND_MODAL";
			modal: {
				type: "history" | "switch" | "detail" | "schedule";
				searchText?: string;
				historySearch?: string;
				activeIndex?: number;
				scope?: "all" | "agent" | "team";
				focusArea?: "search" | "list";
				scheduleTask?: string;
				scheduleRule?: string;
			};
	  }
	| { type: "PATCH_COMMAND_MODAL"; modal: Partial<AppState["commandModal"]> }
	| { type: "CLOSE_COMMAND_MODAL" }
	| { type: "SET_TIMELINE_NODE"; id: string; node: TimelineNode }
	| {
			type: "PATCH_CONTENT_TTS_VOICE_BLOCK";
			nodeId: string;
			signature: string;
			patch: Partial<TtsVoiceBlock>;
	  }
	| {
			type: "REMOVE_INACTIVE_CONTENT_TTS_VOICE_BLOCKS";
			nodeId: string;
			activeSignatures: Set<string>;
	  }
	| { type: "APPEND_TIMELINE_ORDER"; id: string }
	| { type: "SET_TOOL_STATE"; key: string; state: ToolState }
	| { type: "SET_PENDING_TOOL"; key: string; tool: PendingTool }
	| { type: "SET_ACTION_STATE"; key: string; state: ActionState }
	| { type: "ADD_EXECUTED_ACTION_ID"; actionId: string }
	| {
			type: "SET_EVENT_POPOVER";
			index: number;
			event: AgentEvent | null;
			anchor?: { x: number; y: number } | null;
	  }
	| { type: "RESET_CONVERSATION" }
	| { type: "RESET_ACTIVE_CONVERSATION" }
	| { type: "INCREMENT_TIMELINE_COUNTER" }
	| { type: "SET_MESSAGE"; id: string; message: Message }
	| { type: "SET_MESSAGE_ORDER"; order: string[] }
	| { type: "SET_CONTENT_NODE_BY_ID"; contentId: string; nodeId: string }
	| { type: "SET_REASONING_NODE_BY_ID"; reasoningId: string; nodeId: string }
	| {
			type: "SET_REASONING_COLLAPSE_TIMER";
			reasoningId: string;
			timer: UiTimerHandle;
	  }
	| { type: "CLEAR_REASONING_COLLAPSE_TIMER"; reasoningId: string }
	| { type: "SET_TOOL_NODE_BY_ID"; toolId: string; nodeId: string }
	| { type: "SET_ACTIVE_REASONING_KEY"; key: string }
	| { type: "SET_CHAT_AGENT_BY_ID"; chatId: string; agentKey: string }
	| { type: "BATCH_UPDATE"; updates: Partial<AppState> };

function buildConversationResetState(
	state: AppState,
	options: { preserveWorkerContext?: boolean } = {},
): AppState {
	const preserveWorkerContext = Boolean(options.preserveWorkerContext);
	return {
		...state,
		runId: "",
		requestId: "",
		streaming: false,
		abortController: null,
		messagesById: new Map(),
		messageOrder: [],
		events: [],
		artifacts: [],
		plan: null,
		planRuntimeByTaskId: new Map(),
		taskItemsById: new Map(),
		taskGroupsById: new Map(),
		activeTaskIds: new Set(),
		agentGroupsByGroupId: new Map(),
		groupIdByTaskId: new Map(),
		groupIdByMainToolId: new Map(),
		planCurrentRunningTaskId: "",
		planLastTouchedTaskId: "",
		artifactExpanded: false,
		artifactManualOverride: null,
		artifactAutoCollapseTimer: null,
		planExpanded: false,
		planManualOverride: null,
		planAutoCollapseTimer: null,
		toolStates: new Map(),
		toolNodeById: new Map(),
		contentNodeById: new Map(),
		pendingTools: new Map(),
		reasoningNodeById: new Map(),
		reasoningCollapseTimers: new Map(),
		actionStates: new Map(),
		executedActionIds: new Set(),
		timelineNodes: new Map(),
		timelineOrder: [],
		timelineNodeByMessageId: new Map(),
		timelineDomCache: new Map(),
		timelineCounter: 0,
		renderQueue: {
			dirtyNodeIds: new Set(),
			scheduled: false,
			stickToBottomRequested: false,
			fullSyncNeeded: false,
		},
		activeReasoningKey: "",
		activeFrontendTool: null,
		activeAwaiting: null,
		attachmentPreview: null,
		inputMode: "text",
		voiceChat: {
			...state.voiceChat,
			status: "idle",
			sessionActive: false,
			partialUserText: "",
			partialAssistantText: "",
			activeAssistantContentId: "",
			activeRequestId: "",
			activeTtsTaskId: "",
			ttsCommitted: false,
			error: "",
			wsStatus: "idle",
			currentAgentKey: "",
			currentAgentName: "",
		},
		workerRelatedChats: preserveWorkerContext ? state.workerRelatedChats : [],
		workerChatPanelCollapsed: preserveWorkerContext
			? state.workerChatPanelCollapsed
			: true,
		steerDraft: "",
		pendingSteers: [],
		downvotedRunKeys: new Set(),
		eventPopoverIndex: -1,
		eventPopoverEventRef: null,
		eventPopoverAnchor: null,
		commandStatusOverlay: {
			visible: false,
			commandType: null,
			phase: "success",
			text: "",
			timer: null,
		},
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
}

function upsertArtifact(
	artifacts: PublishedArtifact[],
	artifact: PublishedArtifact,
): PublishedArtifact[] {
	const index = artifacts.findIndex(
		(item) => item.artifactId === artifact.artifactId,
	);
	if (index < 0) {
		return [...artifacts, artifact];
	}
	const next = artifacts.slice();
	next[index] = artifact;
	return next;
}

function patchActiveAwaiting(
	current: ActiveAwaiting,
	patch: Extract<AppAction, { type: "PATCH_ACTIVE_AWAITING" }>["patch"],
): ActiveAwaiting {
	if (current.mode === "form") {
		return {
			...current,
			...(typeof patch.resolvedByOther === "boolean"
				? { resolvedByOther: patch.resolvedByOther }
				: {}),
			...(typeof patch.loading === "boolean" ? { loading: patch.loading } : {}),
			...(typeof patch.loadError === "string"
				? { loadError: patch.loadError }
				: {}),
			...(typeof patch.viewportHtml === "string"
				? { viewportHtml: patch.viewportHtml }
				: {}),
		};
	}

	if (typeof patch.resolvedByOther === "boolean") {
		return {
			...current,
			resolvedByOther: patch.resolvedByOther,
		};
	}

	return current;
}

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
			const taskItemsById = new Map(state.taskItemsById);
			taskItemsById.set(action.taskId, action.task);
			return { ...state, taskItemsById };
		}
		case "SET_TASK_GROUP_META": {
			const taskGroupsById = new Map(state.taskGroupsById);
			taskGroupsById.set(action.groupId, action.group);
			return { ...state, taskGroupsById };
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
			const activeTaskIds = new Set(state.activeTaskIds);
			activeTaskIds.add(action.taskId);
			return { ...state, activeTaskIds };
		}
		case "REMOVE_ACTIVE_TASK_ID": {
			if (!state.activeTaskIds.has(action.taskId)) {
				return state;
			}
			const activeTaskIds = new Set(state.activeTaskIds);
			activeTaskIds.delete(action.taskId);
			return { ...state, activeTaskIds };
		}
		case "SET_PLAN_CURRENT_RUNNING_TASK_ID":
			return { ...state, planCurrentRunningTaskId: action.taskId };
		case "SET_PLAN_LAST_TOUCHED_TASK_ID":
			return { ...state, planLastTouchedTaskId: action.taskId };
		case "SET_PLAN_RUNTIME": {
			const planRuntimeByTaskId = new Map(state.planRuntimeByTaskId);
			planRuntimeByTaskId.set(action.taskId, action.runtime);
			return { ...state, planRuntimeByTaskId };
		}
		case "SET_SETTINGS_OPEN":
			return { ...state, settingsOpen: action.open };
		case "SET_LEFT_DRAWER_OPEN":
			return { ...state, leftDrawerOpen: action.open };
		case "SET_RIGHT_DRAWER_OPEN":
			return { ...state, rightDrawerOpen: action.open };
		case "SET_TERMINAL_DOCK_OPEN":
			return { ...state, terminalDockOpen: action.open };
		case "SET_LAYOUT_MODE":
			return { ...state, layoutMode: action.mode };
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
			const downvotedRunKeys = new Set(state.downvotedRunKeys);
			if (downvotedRunKeys.has(action.runKey)) {
				downvotedRunKeys.delete(action.runKey);
			} else {
				downvotedRunKeys.add(action.runKey);
			}
			return { ...state, downvotedRunKeys };
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
			const timelineNodes = new Map(state.timelineNodes);
			timelineNodes.set(action.id, action.node);
			return { ...state, timelineNodes };
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

			const timelineNodes = new Map(state.timelineNodes);
			timelineNodes.set(action.nodeId, {
				...current,
				ttsVoiceBlocks: blocks,
			});
			return { ...state, timelineNodes };
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

			const timelineNodes = new Map(state.timelineNodes);
			timelineNodes.set(action.nodeId, {
				...current,
				ttsVoiceBlocks: blocks,
			});
			return { ...state, timelineNodes };
		}
		case "APPEND_TIMELINE_ORDER":
			return {
				...state,
				timelineOrder: [...state.timelineOrder, action.id],
			};
		case "SET_TOOL_STATE": {
			const toolStates = new Map(state.toolStates);
			toolStates.set(action.key, action.state);
			return { ...state, toolStates };
		}
		case "SET_PENDING_TOOL": {
			const pendingTools = new Map(state.pendingTools);
			pendingTools.set(action.key, action.tool);
			return { ...state, pendingTools };
		}
		case "SET_ACTION_STATE": {
			const actionStates = new Map(state.actionStates);
			actionStates.set(action.key, action.state);
			return { ...state, actionStates };
		}
		case "ADD_EXECUTED_ACTION_ID": {
			const executedActionIds = new Set(state.executedActionIds);
			executedActionIds.add(action.actionId);
			return { ...state, executedActionIds };
		}
		case "SET_EVENT_POPOVER":
			return {
				...state,
				eventPopoverIndex: action.index,
				eventPopoverEventRef: action.event,
				eventPopoverAnchor: action.anchor ?? null,
			};
		case "SET_MESSAGE": {
			const messagesById = new Map(state.messagesById);
			messagesById.set(action.id, action.message);
			return { ...state, messagesById };
		}
		case "SET_MESSAGE_ORDER":
			return { ...state, messageOrder: action.order };
		case "SET_CONTENT_NODE_BY_ID": {
			const contentNodeById = new Map(state.contentNodeById);
			contentNodeById.set(action.contentId, action.nodeId);
			return { ...state, contentNodeById };
		}
		case "SET_REASONING_NODE_BY_ID": {
			const reasoningNodeById = new Map(state.reasoningNodeById);
			reasoningNodeById.set(action.reasoningId, action.nodeId);
			return { ...state, reasoningNodeById };
		}
		case "SET_REASONING_COLLAPSE_TIMER": {
			const reasoningCollapseTimers = new Map(state.reasoningCollapseTimers);
			reasoningCollapseTimers.set(action.reasoningId, action.timer);
			return { ...state, reasoningCollapseTimers };
		}
		case "CLEAR_REASONING_COLLAPSE_TIMER": {
			if (!state.reasoningCollapseTimers.has(action.reasoningId)) {
				return state;
			}
			const reasoningCollapseTimers = new Map(state.reasoningCollapseTimers);
			reasoningCollapseTimers.delete(action.reasoningId);
			return { ...state, reasoningCollapseTimers };
		}
		case "SET_TOOL_NODE_BY_ID": {
			const toolNodeById = new Map(state.toolNodeById);
			toolNodeById.set(action.toolId, action.nodeId);
			return { ...state, toolNodeById };
		}
		case "SET_ACTIVE_REASONING_KEY":
			return { ...state, activeReasoningKey: action.key };
		case "SET_CHAT_AGENT_BY_ID": {
			const chatAgentById = new Map(state.chatAgentById);
			chatAgentById.set(action.chatId, action.agentKey);
			return { ...state, chatAgentById };
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
