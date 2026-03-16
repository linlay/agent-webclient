import React, {
	createContext,
	useContext,
	useReducer,
	useCallback,
	useMemo,
	useRef,
} from "react";
import type {
	AppState,
	AgentEvent,
	Chat,
	Agent,
	Message,
	TimelineNode,
	ToolState,
	PendingTool,
	DebugSseEntry,
	PlanRuntime,
	Plan,
	ActiveFrontendTool,
	ActionState,
	Team,
	WorkerRow,
	WorkerConversationRow,
	UiTimerHandle,
	PendingSteer,
	VoiceChatState,
} from "./types";
import {
	ACCESS_TOKEN_STORAGE_KEY,
	MAX_DEBUG_LINES,
	MAX_EVENTS,
} from "./constants";
import type { DebugTab, LayoutMode } from "./constants";
import { upsertChatSummary } from "../lib/chatSummary";

/* ============================================
   Initial State Factory
   ============================================ */
export function createInitialState(): AppState {
	const storedToken =
		typeof localStorage !== "undefined"
			? localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) || ""
			: "";

	const initialVoiceChat: VoiceChatState = {
		status: "idle",
		sessionActive: false,
		partialUserText: "",
		partialAssistantText: "",
		error: "",
		wsStatus: "idle",
		capabilities: null,
		capabilitiesLoaded: false,
		capabilitiesError: "",
		voices: [],
		voicesLoaded: false,
		voicesError: "",
		selectedVoice: "",
		speechRate: 1.2,
		currentAgentKey: "",
		currentAgentName: "",
	};

	return {
		agents: [],
		teams: [],
		chats: [],
		chatAgentById: new Map(),
		pendingNewChatAgentKey: "",
		workerPriorityKey: "",
		chatId: "",
		runId: "",
		requestId: "",
		streaming: false,
		abortController: null,
		messagesById: new Map(),
		messageOrder: [],
		events: [],
		debugLines: [],
		rawSseEntries: [],
		plan: null,
		planRuntimeByTaskId: new Map(),
		planCurrentRunningTaskId: "",
		planLastTouchedTaskId: "",
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
		chatFilter: "",
		conversationMode: "worker",
		workerSelectionKey: "",
		workerRows: [],
		workerIndexByKey: new Map(),
		workerRelatedChats: [],
		workerChatPanelCollapsed: true,
		chatLoadSeq: 0,
		settingsOpen: false,
		activeDebugTab: "events",
		leftDrawerOpen: false,
		rightDrawerOpen: false,
		desktopDebugSidebarEnabled: false,
		layoutMode: "mobile-drawer",
		planExpanded: false,
		planManualOverride: null,
		planAutoCollapseTimer: null,
		mentionOpen: false,
		mentionSuggestions: [],
		mentionActiveIndex: 0,
		activeFrontendTool: null,
		accessToken: storedToken,
		ttsDebugStatus: "idle",
		planningMode: false,
		inputMode: "text",
		voiceChat: initialVoiceChat,
		steerDraft: "",
		pendingSteers: [],
		downvotedRunKeys: new Set(),
		eventPopoverIndex: -1,
		eventPopoverEventRef: null,
		eventPopoverAnchor: null,
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

/* ============================================
   Action Types
   ============================================ */
export type AppAction =
	| { type: "SET_AGENTS"; agents: Agent[] }
	| { type: "SET_TEAMS"; teams: Team[] }
	| { type: "SET_CHATS"; chats: Chat[] }
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
	| { type: "APPEND_RAW_SSE_ENTRY"; entry: DebugSseEntry }
	| { type: "CLEAR_RAW_SSE_ENTRIES" }
	| { type: "SET_PLAN"; plan: Plan | null }
	| { type: "SET_PLAN_EXPANDED"; expanded: boolean }
	| { type: "SET_PLAN_MANUAL_OVERRIDE"; override: boolean | null }
	| { type: "SET_PLAN_CURRENT_RUNNING_TASK_ID"; taskId: string }
	| { type: "SET_PLAN_LAST_TOUCHED_TASK_ID"; taskId: string }
	| { type: "SET_PLAN_RUNTIME"; taskId: string; runtime: PlanRuntime }
	| { type: "SET_SETTINGS_OPEN"; open: boolean }
	| { type: "SET_ACTIVE_DEBUG_TAB"; tab: DebugTab }
	| { type: "SET_LEFT_DRAWER_OPEN"; open: boolean }
	| { type: "SET_RIGHT_DRAWER_OPEN"; open: boolean }
	| { type: "SET_LAYOUT_MODE"; mode: LayoutMode }
	| { type: "SET_CHAT_FILTER"; filter: string }
	| { type: "SET_CONVERSATION_MODE"; mode: "chat" | "worker" }
	| { type: "SET_WORKER_SELECTION_KEY"; workerKey: string }
	| { type: "SET_WORKER_ROWS"; rows: WorkerRow[] }
	| { type: "SET_WORKER_RELATED_CHATS"; chats: WorkerConversationRow[] }
	| { type: "SET_WORKER_CHAT_PANEL_COLLAPSED"; collapsed: boolean }
	| { type: "SET_DESKTOP_DEBUG_SIDEBAR_ENABLED"; enabled: boolean }
	| { type: "SET_PENDING_NEW_CHAT_AGENT_KEY"; agentKey: string }
	| { type: "SET_WORKER_PRIORITY_KEY"; workerKey: string }
	| { type: "SET_ACCESS_TOKEN"; token: string }
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

/* ============================================
   Reducer
   ============================================ */
function buildConversationResetState(
	state: AppState,
	options: { preserveWorkerContext?: boolean } = {},
): AppState {
	const preserveWorkerContext = Boolean(options.preserveWorkerContext);
	return {
		...state,
		messagesById: new Map(),
		messageOrder: [],
		events: [],
		rawSseEntries: [],
		plan: null,
		planRuntimeByTaskId: new Map(),
		planCurrentRunningTaskId: "",
		planLastTouchedTaskId: "",
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
		inputMode: "text",
		voiceChat: {
			...state.voiceChat,
			status: "idle",
			sessionActive: false,
			partialUserText: "",
			partialAssistantText: "",
			error: "",
			wsStatus: "idle",
			currentAgentKey: "",
			currentAgentName: "",
		},
		workerRelatedChats: preserveWorkerContext
			? state.workerRelatedChats
			: [],
		workerChatPanelCollapsed: preserveWorkerContext
			? state.workerChatPanelCollapsed
			: true,
		steerDraft: "",
		pendingSteers: [],
		downvotedRunKeys: new Set(),
		eventPopoverIndex: -1,
		eventPopoverEventRef: null,
		eventPopoverAnchor: null,
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

export function appReducer(state: AppState, action: AppAction): AppState {
	switch (action.type) {
		case "SET_AGENTS":
			return { ...state, agents: action.agents };
		case "SET_TEAMS":
			return { ...state, teams: action.teams };
		case "SET_CHATS":
			return { ...state, chats: action.chats };
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
					? [
							...state.events.slice(
								-Math.floor(MAX_EVENTS * 0.8),
							),
							action.event,
						]
					: [...state.events, action.event];
			return { ...state, events };
		}
		case "CLEAR_EVENTS":
			return { ...state, events: [] };
		case "APPEND_DEBUG": {
			const debugLines =
				state.debugLines.length >= MAX_DEBUG_LINES
					? [
							...state.debugLines.slice(
								-Math.floor(MAX_DEBUG_LINES * 0.8),
							),
							action.line,
						]
					: [...state.debugLines, action.line];
			return { ...state, debugLines };
		}
		case "CLEAR_DEBUG":
			return { ...state, debugLines: [] };
		case "APPEND_RAW_SSE_ENTRY": {
			const rawSseEntries =
				state.rawSseEntries.length >= MAX_DEBUG_LINES
					? [
							...state.rawSseEntries.slice(
								-Math.floor(MAX_DEBUG_LINES * 0.8),
							),
							action.entry,
						]
					: [...state.rawSseEntries, action.entry];
			return { ...state, rawSseEntries };
		}
		case "CLEAR_RAW_SSE_ENTRIES":
			return { ...state, rawSseEntries: [] };
		case "SET_PLAN":
			return { ...state, plan: action.plan };
		case "SET_PLAN_EXPANDED":
			return { ...state, planExpanded: action.expanded };
		case "SET_PLAN_MANUAL_OVERRIDE":
			return { ...state, planManualOverride: action.override };
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
		case "SET_ACTIVE_DEBUG_TAB":
			return { ...state, activeDebugTab: action.tab };
		case "SET_LEFT_DRAWER_OPEN":
			return { ...state, leftDrawerOpen: action.open };
		case "SET_RIGHT_DRAWER_OPEN":
			return { ...state, rightDrawerOpen: action.open };
		case "SET_LAYOUT_MODE":
			return { ...state, layoutMode: action.mode };
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
		case "SET_ACCESS_TOKEN":
			return { ...state, accessToken: action.token };
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
			const reasoningCollapseTimers = new Map(
				state.reasoningCollapseTimers,
			);
			reasoningCollapseTimers.set(action.reasoningId, action.timer);
			return { ...state, reasoningCollapseTimers };
		}
		case "CLEAR_REASONING_COLLAPSE_TIMER": {
			if (!state.reasoningCollapseTimers.has(action.reasoningId)) {
				return state;
			}
			const reasoningCollapseTimers = new Map(
				state.reasoningCollapseTimers,
			);
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

/* ============================================
   Context
   ============================================ */
export interface AppContextValue {
	state: AppState;
	dispatch: React.Dispatch<AppAction>;
	stateRef: React.MutableRefObject<AppState>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const [state, baseDispatch] = useReducer(
		appReducer,
		undefined,
		createInitialState,
	);
	const stateRef = useRef(state);
	stateRef.current = state;

	const dispatch = useCallback<React.Dispatch<AppAction>>((action) => {
		if (
			action.type === "RESET_CONVERSATION" ||
			action.type === "RESET_ACTIVE_CONVERSATION"
		) {
			for (const timer of stateRef.current.reasoningCollapseTimers.values()) {
				clearTimeout(timer);
			}
		}
		baseDispatch(action);
	}, []);

	const value = useMemo<AppContextValue>(
		() => ({ state, dispatch, stateRef }),
		[state, dispatch],
	);

	return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useAppContext(): AppContextValue {
	const ctx = useContext(AppContext);
	if (!ctx) {
		throw new Error("useAppContext must be used within an AppProvider");
	}
	return ctx;
}

export function useAppState(): AppState {
	return useAppContext().state;
}

export function useAppDispatch(): React.Dispatch<AppAction> {
	return useAppContext().dispatch;
}
