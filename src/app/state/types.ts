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
} from "@/shared/data/memoryTypes";
import type { ThemeMode } from "@/shared/styles/theme";
import type { TransportMode } from "@/features/transport/lib/transportMode";
import type {
	ActionState,
	ActiveAwaiting,
	ActiveFrontendTool,
	PendingTool,
	Plan,
	PlanRuntime,
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
	FileChangeSummary,
	RightSidebarTabKey,
	RenderQueue,
	UiTimerHandle,
} from "@/app/state/uiTypes";
import type { TimelineNode } from "@/app/state/timelineTypes";
import type {
	InputMode,
	VoiceChatState,
	WsConnectionStatus,
} from "@/app/state/voiceTypes";
import type { AutomationSummaryResponse } from "@/shared/data";
import type { AIUsageSnapshotEvent } from "@/app/state/eventTypes";

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
	AIAwaitPlan,
	AIAwaitPlanDecision,
	AIAwaitPlanInput,
	AIAwaitPlanOption,
	AIAwaitPlanSubmitParamData,
	AIAwaitQuestion,
	AIAwaitQuestionOption,
	AIAwaitQuestionSubmitParamData,
	AIAwaitSubmitParamData,
	AIAwaitSubmitPayloadData,
	AIContextCompactEvent,
	AIUsageEstimatedCost,
	AIUsageSnapshotEvent,
	AIUsageStats,
} from "@/app/state/eventTypes";
export {
	AWAITING_ANSWER_EVENT_TYPE,
	AWAITING_ANSWER_PUSH_EVENT_TYPE,
	AWAITING_ANSWER_STREAM_EVENT_TYPE,
	AWAITING_ASK_PUSH_EVENT_TYPE,
	AWAITING_ASK_STREAM_EVENT_TYPE,
	AIAwaitEventTypeEnum,
	AIAwaitQuestionType,
	AIContentEventTypeEnum,
	AIContextEventTypeEnum,
	AIPlanningEventTypeEnum,
	AIReasoningEventTypeEnum,
	AIRunEventTypeEnum,
	AIToolEventTypeEnum,
	AIUsageEventTypeEnum,
	ViewportTypeEnum,
	isAwaitingAnswerLike,
	isAwaitingAnswerPushEvent,
	isAwaitingAnswerStreamEvent,
	isAwaitingAskLike,
	isAwaitingAskPushEvent,
	isAwaitingAskStreamEvent,
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
	automations: AutomationSummaryResponse[];
	sidebarPendingRequestCount: number;
	chatAgentById: Map<string, string>;
	runAgentById: Map<string, string>;
	currentRunAgentKey: string;
	pendingNewChatAgentKey: string;
	workerPriorityKey: string;
	temporaryPinnedAgentKey: string;
	chatId: string;
	runId: string;
	requestId: string;
	streaming: boolean;
	abortController: AbortController | null;
	messagesById: Map<string, Message>;
	messageOrder: string[];
	events: AgentEvent[];
	debugEvents: AgentEvent[];
	debugLines: string[];
	artifacts: PublishedArtifact[];
	fileChanges: FileChangeSummary[];
	plan: Plan | null;
	planRuntimeByTaskId: Map<string, PlanRuntime>;
	taskItemsById: Map<string, TaskItemMeta>;
	activeTaskIds: Set<string>;
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
	archiveOpen: boolean;
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
	rightSidebarOpen: boolean;
	rightSidebarOpenTab: RightSidebarTabKey | null;
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
	planningModeByChatId: Record<string, boolean>;
	usageSnapshot: AIUsageSnapshotEvent | null;
	usagePopoverOpen: boolean;
	inputMode: InputMode;
	voiceChat: VoiceChatState;
	composerDraft: string;
	composerDraftByChatId: Record<string, string>;
	pendingSteers: Record<string, PendingSteer[]>;
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
