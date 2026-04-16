import type { LayoutMode } from "./constants";
import type { ContentSegment } from "../lib/contentSegments";
import type { ActionRuntime } from "../lib/actionRuntime";
import type { AttachmentPreviewState } from "../lib/attachmentPreview";
import type { ThemeMode } from "../lib/theme";
import type {
  AIEvent,
  AIAwaitQuestion,
} from "./eventTypes";
import { ViewportTypeEnum } from "./eventTypes";
export type { ThemeMode } from "../lib/theme";
export type {
  AIAwaitQuestion,
  AIAwaitQuestionOption,
  AIAwaitSubmitParamData,
  AIAwaitSubmitPayloadData,
} from "./eventTypes";
export {
  AIAwaitEventTypeEnum,
  AIAwaitQuestionType,
  ViewportTypeEnum,
} from "./eventTypes";

/* ============================================
   Agent Event
   ============================================ */
export type AgentEvent = AIEvent;

export interface ResourceFile {
  mimeType: string;
  name: string;
  sha256: string;
  sizeBytes: number;
  type: "file";
  url: string;
}
export interface ArtifactFile extends ResourceFile {
  artifactId?: string;
}

export interface PublishedArtifact {
  artifactId: string;
  artifact: ResourceFile;
  timestamp: number;
}

export interface DebugSseEntry {
  receivedAt: number;
  rawFrame: string;
  parsedEventName?: string;
}

export type UiTimerHandle = number;

/* ============================================
   Timeline
   ============================================ */
export type TimelineNodeKind =
  | "message"
  | "thinking"
  | "awaiting-answer"
  | "tool"
  | "content";
export type TimelineRole = "user" | "assistant" | "system" | "";

export interface ToolResultPayload {
  text: string;
  isCode: boolean;
}

export interface TimelineAttachment {
  name: string;
  size?: number;
  type?: string;
  mimeType?: string;
  url?: string;
  previewUrl?: string;
}

export interface EmbeddedViewport {
  signature: string;
  key: string;
  payload: unknown;
  payloadRaw: string;
  html: string;
  loading: boolean;
  error: string;
  loadStarted: boolean;
  lastLoadRunId: string;
  ts?: number;
}

export interface TtsVoiceBlock {
  signature: string;
  text: string;
  closed: boolean;
  expanded: boolean;
  status: "ready" | "connecting" | "playing" | "done" | "error" | "stopped";
  error: string;
  sampleRate?: number;
  channels?: number;
}

export interface TimelineNode {
  id: string;
  kind: TimelineNodeKind;
  role?: TimelineRole;
  messageVariant?: "default" | "steer" | "remember" | "learn";
  steerId?: string;
  awaitingId?: string;
  reasoningLabel?: string;
  title?: string;
  text?: string;
  attachments?: TimelineAttachment[];
  status?: string;
  expanded?: boolean;
  ts: number;
  /* tool-specific */
  toolId?: string;
  toolLabel?: string;
  toolName?: string;
  viewportKey?: string;
  description?: string;
  argsText?: string;
  result?: ToolResultPayload | null;
  /* content-specific */
  contentId?: string;
  segments?: ContentSegment[];
  embeddedViewports?: Record<string, EmbeddedViewport>;
  ttsVoiceBlocks?: Record<string, TtsVoiceBlock>;
}

/* ============================================
   Tool / Action State
   ============================================ */
export interface ToolState {
  toolId: string;
  argsBuffer: string;
  toolLabel?: string;
  toolName: string;
  toolType: string;
  viewportKey: string;
  toolTimeout: number | null;
  toolParams: Record<string, unknown> | null;
  description: string;
  runId: string;
}

export interface ActionState {
  actionId: string;
  actionName: string;
  argsBuffer: string;
}

/* ============================================
   Pending Tool
   ============================================ */
export interface PendingTool {
  key: string;
  runId: string;
  toolId: string;
  toolLabel?: string;
  toolName: string;
  viewportKey: string;
  toolType: string;
  description: string;
  payloadText: string;
  status: string;
  statusText?: string;
}

/* ============================================
   Plan
   ============================================ */
export interface PlanItem {
  taskId: string;
  description?: string;
  status?: string;
  [key: string]: unknown;
}

export interface Plan {
  planId: string;
  plan: PlanItem[];
}

export interface PlanRuntime {
  status: string;
  updatedAt: number;
  error: string;
}

/* ============================================
   Active Frontend Tool
   ============================================ */
export interface ActiveFrontendTool {
  key: string;
  runId: string;
  toolId: string;
  viewportKey: string;
  toolType: string;
  toolLabel?: string;
  toolName: string;
  description: string;
  toolTimeout: number | null;
  toolParams: Record<string, unknown>;
  loading: boolean;
  loadError: string;
  viewportHtml: string;
}

/* ============================================
   Active Awaiting
   ============================================ */
export interface ActiveAwaiting {
  key: string;
  awaitingId: string;
  runId: string;
  timeout: number | null;
  viewportKey: string;
  viewportType: ViewportTypeEnum;
  questions: AIAwaitQuestion[];
}

/* ============================================
   Message
   ============================================ */
export interface Message {
  id: string;
  role: string;
  text: string;
  ts: number;
}

export interface PendingSteer {
  steerId: string;
  message: string;
  requestId: string;
  runId: string;
  createdAt: number;
}

export type InputMode = "text" | "voice";
export type VoiceChatStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";
export type VoiceChatWsStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";

export interface VoiceClientGateSettings {
  enabled?: boolean;
  rmsThreshold?: number;
  openHoldMs?: number;
  closeHoldMs?: number;
  preRollMs?: number;
}

export interface VoiceClientGateConfig {
  enabled: boolean;
  rmsThreshold: number;
  openHoldMs: number;
  closeHoldMs: number;
  preRollMs: number;
}

export interface VoiceCapabilities {
  websocketPath?: string;
  asr?: {
    configured?: boolean;
    defaults?: {
      sampleRate?: number;
      language?: string;
      clientGate?: VoiceClientGateSettings;
      turnDetection?: {
        type?: string;
        threshold?: number;
        silenceDurationMs?: number;
      };
    };
  };
  tts?: {
    modes?: string[];
    deprecatedModes?: string[];
    defaultMode?: "local" | "llm";
    streamInput?: boolean;
    runnerConfigured?: boolean;
    speechRateDefault?: number;
    audioFormat?: {
      sampleRate?: number;
      channels?: number;
      responseFormat?: string;
    };
    voicesEndpoint?: string;
  };
}

export interface VoiceOption {
  id: string;
  displayName: string;
  provider: string;
  default: boolean;
}

export interface VoiceChatState {
  status: VoiceChatStatus;
  sessionActive: boolean;
  partialUserText: string;
  partialAssistantText: string;
  activeAssistantContentId: string;
  activeRequestId: string;
  activeTtsTaskId: string;
  ttsCommitted: boolean;
  error: string;
  wsStatus: VoiceChatWsStatus;
  capabilities: VoiceCapabilities | null;
  capabilitiesLoaded: boolean;
  capabilitiesError: string;
  voices: VoiceOption[];
  voicesLoaded: boolean;
  voicesError: string;
  selectedVoice: string;
  speechRate: number;
  clientGate: VoiceClientGateConfig;
  clientGateCustomized: boolean;
  currentAgentKey: string;
  currentAgentName: string;
}

export type CommandStatusOverlayCommandType = "remember" | "learn" | null;
export type CommandStatusOverlayPhase = "pending" | "success" | "error";

export interface CommandStatusOverlayState {
  visible: boolean;
  commandType: CommandStatusOverlayCommandType;
  phase: CommandStatusOverlayPhase;
  text: string;
  timer: UiTimerHandle | null;
}

export type CommandModalType =
  | "history"
  | "switch"
  | "detail"
  | "schedule"
  | null;
export type CommandModalScope = "all" | "agent" | "team";
export type CommandModalFocusArea = "search" | "list";

export interface CommandModalState {
  open: boolean;
  type: CommandModalType;
  searchText: string;
  historySearch: string;
  activeIndex: number;
  scope: CommandModalScope;
  focusArea: CommandModalFocusArea;
  scheduleTask: string;
  scheduleRule: string;
}

/* ============================================
   Chat
   ============================================ */
export interface Chat {
  chatId: string;
  chatName?: string;
  firstAgentName?: string;
  firstAgentKey?: string;
  agentKey?: string;
  teamId?: string;
  updatedAt?: string | number;
  lastRunId?: string;
  lastRunContent?: string;
  [key: string]: unknown;
}

/* ============================================
   Agent
   ============================================ */
export interface Agent {
  key: string;
  name: string;
  role?: string;
  controls?: AgentControl[];
  icon?: {
    color?: string;
    name?: string;
  }
  [key: string]: unknown;
}

export interface AgentControl {
  type: "switch" | "select" | "string" | "number" | "date";
  icon: any;
  key: string;
  label: string;
  options?: AgentControlOption[];
  defaultValue?: any;
}
export interface AgentControlOption {
  value: any;
  label: any;
  type?: "text" | "img";
}

export interface Team {
  teamId: string;
  name?: string;
  role?: string;
  agentKey?: string;
  agentKeys?: string[];
  agents?: Array<string | { key?: string; agentKey?: string }>;
  members?: Array<string | { key?: string; agentKey?: string }>;
  icon?: {
    color?: string;
    name?: string;
  }
  [key: string]: unknown;
}

export type ConversationMode = "chat" | "worker";

export interface WorkerRow {
  key: string;
  type: "agent" | "team";
  sourceId: string;
  displayName: string;
  role: string;
  teamAgentLabels: string[];
  latestChatId: string;
  latestRunId: string;
  latestUpdatedAt: number;
  latestChatName: string;
  latestRunContent: string;
  hasHistory: boolean;
  latestRunSortValue: number;
  searchText: string;
}

export interface WorkerConversationRow {
  chatId: string;
  chatName: string;
  updatedAt: number;
  lastRunId: string;
  lastRunContent: string;
}

/* ============================================
   Render Queue
   ============================================ */
export interface RenderQueue {
  dirtyNodeIds: Set<string>;
  scheduled: boolean;
  stickToBottomRequested: boolean;
  fullSyncNeeded: boolean;
}

/* ============================================
   App State
   ============================================ */
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
  rawSseEntries: DebugSseEntry[];
  artifacts: PublishedArtifact[];
  plan: Plan | null;
  planRuntimeByTaskId: Map<string, PlanRuntime>;
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
  leftDrawerOpen: boolean;
  rightDrawerOpen: boolean;
  desktopDebugSidebarEnabled: boolean;
  attachmentPreview: AttachmentPreviewState | null;
  layoutMode: LayoutMode;
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
  accessToken: string;
  audioMuted: boolean;
  ttsDebugStatus: string;
  planningMode: boolean;
  inputMode: InputMode;
  voiceChat: VoiceChatState;
  steerDraft: string;
  pendingSteers: PendingSteer[];
  downvotedRunKeys: Set<string>;
  eventPopoverIndex: number;
  eventPopoverEventRef: AgentEvent | null;
  eventPopoverAnchor: { x: number; y: number } | null;
  commandStatusOverlay: CommandStatusOverlayState;
  commandModal: CommandModalState;
}

/* ============================================
   Services (injected dependencies)
   ============================================ */
export interface Services {
  actionRuntime: ActionRuntime | null;
  [key: string]: unknown;
}
