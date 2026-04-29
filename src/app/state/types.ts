import type { ActionRuntime } from "@/features/tools/lib/actionRuntime";
import type { AttachmentPreviewState } from "@/features/artifacts/lib/attachmentPreview";
import type {
	MemoryInfoFilters,
	MemoryConsoleTab,
	MemoryContextPreviewResponse,
	MemoryContextPromptLayer,
	MemoryMeta,
	MemoryPreferenceMode,
	MemoryScopeDetailMeta,
	MemoryScopeDraftRecord,
	MemoryScopeSaveSummary,
	MemoryScopeSummary,
	MemoryScopeValidationResult,
	MemoryRecordDetail,
	MemoryRecordListItem,
} from "@/shared/api/memoryTypes";
import type { ThemeMode } from "@/shared/styles/theme";
import type { TransportMode } from "@/features/transport/lib/transportMode";
import type {
	ActionState,
	ActiveAwaiting,
	ActiveFrontendTool,
	AgentGroup,
	PendingTool,
	Plan,
	PlanRuntime,
	TaskGroupMeta,
	TaskItemMeta,
	ToolState,
} from "@/app/state/toolTypes";
import type {
	Agent,
	Chat,
	ConversationMode,
	Team,
	WorkerConversationRow,
	WorkerRow,
} from "@/app/state/navigationTypes";
import type {
	AgentEvent,
	CommandModalState,
	CommandStatusOverlayState,
	Message,
	PendingSteer,
	PublishedArtifact,
	RenderQueue,
	UiTimerHandle,
} from "@/app/state/uiTypes";
import type { TimelineNode } from "@/app/state/timelineTypes";
import type {
	InputMode,
	VoiceChatState,
	WsConnectionStatus,
} from "@/app/state/voiceTypes";

export type { ThemeMode } from "@/shared/styles/theme";
export type { TransportMode } from "@/features/transport/lib/transportMode";
export type {
	AIAwaitApproval,
	AIAwaitApprovalOption,
	AIAwaitApprovalDecision,
	AIAwaitApprovalSubmitParamData,
	AIAwaitForm,
	AIAwaitFormSubmitParamData,
	AIAwaitMode,
	AIAwaitQuestion,
	AIAwaitQuestionOption,
	AIAwaitQuestionSubmitParamData,
	AIAwaitSubmitParamData,
	AIAwaitSubmitPayloadData,
} from "@/app/state/eventTypes";
export {
	AIAwaitEventTypeEnum,
	AIAwaitQuestionType,
	ViewportTypeEnum,
} from "@/app/state/eventTypes";
export type * from "@/app/state/timelineTypes";
export type * from "@/app/state/toolTypes";
export type * from "@/app/state/voiceTypes";
export type * from "@/app/state/navigationTypes";
export type * from "@/app/state/uiTypes";

export interface AppState {
	agents: Agent[];
	teams: Team[];
	chats: Chat[];
	sidebarPendingRequestCount: number;
	chatAgentById: Map<string, string>;
	pendingNewChatAgentKey: string;
	workerPriorityKey: string;
	chatId: string;
	runId: string;
	requestId: string;
	streaming: boolean;
	abortController: AbortController | null;
	messagesById: Map<string, Message>;
	messageOrder: string[];
	events: AgentEvent[];
	debugLines: string[];
	artifacts: PublishedArtifact[];
	plan: Plan | null;
	planRuntimeByTaskId: Map<string, PlanRuntime>;
	taskItemsById: Map<string, TaskItemMeta>;
	taskGroupsById: Map<string, TaskGroupMeta>;
	activeTaskIds: Set<string>;
	agentGroupsByGroupId: Map<string, AgentGroup>;
	groupIdByTaskId: Map<string, string>;
	groupIdByMainToolId: Map<string, string>;
	planCurrentRunningTaskId: string;
	planLastTouchedTaskId: string;
	toolStates: Map<string, ToolState>;
	toolNodeById: Map<string, string>;
	contentNodeById: Map<string, string>;
	pendingTools: Map<string, PendingTool>;
	reasoningNodeById: Map<string, string>;
	reasoningCollapseTimers: Map<string, UiTimerHandle>;
	actionStates: Map<string, ActionState>;
	executedActionIds: Set<string>;
	timelineNodes: Map<string, TimelineNode>;
	timelineOrder: string[];
	timelineNodeByMessageId: Map<string, string>;
	timelineDomCache: Map<string, HTMLElement>;
	timelineCounter: number;
	renderQueue: RenderQueue;
	activeReasoningKey: string;
	chatFilter: string;
	conversationMode: ConversationMode;
	workerSelectionKey: string;
	workerRows: WorkerRow[];
	workerIndexByKey: Map<string, WorkerRow>;
	workerRelatedChats: WorkerConversationRow[];
	workerChatPanelCollapsed: boolean;
	chatLoadSeq: number;
	settingsOpen: boolean;
	memoryInfoOpen: boolean;
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
	leftDrawerOpen: boolean;
	desktopDebugSidebarEnabled: boolean;
	terminalDockOpen: boolean;
	attachmentPreview: AttachmentPreviewState | null;
	artifactExpanded: boolean;
	artifactManualOverride: boolean | null;
	artifactAutoCollapseTimer: UiTimerHandle | null;
	planExpanded: boolean;
	planManualOverride: boolean | null;
	planAutoCollapseTimer: UiTimerHandle | null;
	mentionOpen: boolean;
	mentionSuggestions: Agent[];
	mentionActiveIndex: number;
	activeFrontendTool: ActiveFrontendTool | null;
	activeAwaiting: ActiveAwaiting | null;
	themeMode: ThemeMode;
	transportMode: TransportMode;
	wsStatus: WsConnectionStatus;
	wsErrorMessage: string;
	accessToken: string;
	audioMuted: boolean;
	ttsDebugStatus: string;
	planningMode: boolean;
	inputMode: InputMode;
	voiceChat: VoiceChatState;
	composerDraft: string;
	steerDraft: string;
	pendingSteers: PendingSteer[];
	downvotedRunKeys: Set<string>;
	eventPopoverIndex: number;
	eventPopoverEventRef: AgentEvent | null;
	eventPopoverAnchor: { x: number; y: number } | null;
	commandStatusOverlay: CommandStatusOverlayState;
	commandModal: CommandModalState;
}

export interface Services {
	actionRuntime: ActionRuntime | null;
	[key: string]: unknown;
}
