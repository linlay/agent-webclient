import type {
	ActiveAwaiting,
	ActionState,
	ActiveFrontendTool,
	Agent,
	AgentEvent,
	AgentGroup,
	AppState,
	Chat,
	Message,
	PendingSteer,
	PendingTool,
	Plan,
	PlanRuntime,
	PublishedArtifact,
	TaskGroupMeta,
	TaskItemMeta,
	Team,
	TimelineNode,
	ToolState,
	TtsVoiceBlock,
	UiTimerHandle,
	VoiceChatState,
	WorkerConversationRow,
	WorkerRow,
} from "@/app/state/types";
import type { AttachmentPreviewState } from "@/features/artifacts/lib/attachmentPreview";

export type AppAction =
	| { type: "SET_AGENTS"; agents: Agent[] }
	| { type: "SET_TEAMS"; teams: Team[] }
	| { type: "SET_CHATS"; chats: Chat[] }
	| { type: "START_SIDEBAR_REQUEST" }
	| { type: "FINISH_SIDEBAR_REQUEST" }
	| { type: "UPSERT_CHAT"; chat: Partial<Chat> & Pick<Chat, "chatId"> }
	| { type: "CHAT_DELETED"; chatId: string }
	| { type: "MARK_AGENT_CHATS_READ"; agentKey: string }
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
	| { type: "SET_TERMINAL_DOCK_OPEN"; open: boolean }
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
	| { type: "SET_RUN_DOWNVOTED"; runKey: string; downvoted: boolean }
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
