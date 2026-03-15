import type { DebugTab, LayoutMode } from './constants';
import type { ContentSegment } from '../lib/contentSegments';
import type { ActionRuntime } from '../lib/actionRuntime';

/* ============================================
   Agent Event
   ============================================ */
export interface AgentEvent {
  type: string;
  seq?: number;
  chatId?: string;
  runId?: string;
  requestId?: string;
  steerId?: string;
  contentId?: string;
  reasoningId?: string;
  toolId?: string;
  actionId?: string;
  planId?: string;
  taskId?: string;
  agentKey?: string;
  message?: string;
  text?: string;
  delta?: string;
  timestamp?: number;
  finishReason?: string;
  error?: unknown;
  result?: unknown;
  output?: unknown;
  plan?: PlanItem[];
  toolLabel?: string;
  toolName?: string;
  toolType?: string;
  viewportKey?: string;
  toolKey?: string;
  toolTimeout?: number | null;
  toolParams?: Record<string, unknown>;
  description?: string;
  actionName?: string;
  arguments?: string;
  function?: { arguments?: unknown };
  [key: string]: unknown;
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
export type TimelineNodeKind = 'message' | 'thinking' | 'tool' | 'content';
export type TimelineRole = 'user' | 'assistant' | 'system' | '';

export interface ToolResultPayload {
  text: string;
  isCode: boolean;
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
  status: 'ready' | 'connecting' | 'playing' | 'done' | 'error' | 'stopped';
  error: string;
  sampleRate?: number;
  channels?: number;
}

export interface TimelineNode {
  id: string;
  kind: TimelineNodeKind;
  role?: TimelineRole;
  messageVariant?: 'default' | 'steer';
  steerId?: string;
  text?: string;
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

export type CommandModalType = 'history' | 'switch' | 'detail' | 'schedule' | null;
export type CommandModalScope = 'all' | 'agent' | 'team';
export type CommandModalFocusArea = 'search' | 'list';

export interface CommandModalState {
  open: boolean;
  type: CommandModalType;
  searchText: string;
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
  [key: string]: unknown;
}

export interface Team {
  teamId: string;
  name?: string;
  role?: string;
  agentKey?: string;
  agentKeys?: string[];
  agents?: Array<string | { key?: string; agentKey?: string }>;
  members?: Array<string | { key?: string; agentKey?: string }>;
  [key: string]: unknown;
}

export type ConversationMode = 'chat' | 'worker';

export interface WorkerRow {
  key: string;
  type: 'agent' | 'team';
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
  activeDebugTab: DebugTab;
  leftDrawerOpen: boolean;
  rightDrawerOpen: boolean;
  desktopDebugSidebarEnabled: boolean;
  layoutMode: LayoutMode;
  planExpanded: boolean;
  planManualOverride: boolean | null;
  planAutoCollapseTimer: UiTimerHandle | null;
  mentionOpen: boolean;
  mentionSuggestions: Agent[];
  mentionActiveIndex: number;
  activeFrontendTool: ActiveFrontendTool | null;
  accessToken: string;
  ttsDebugStatus: string;
  planningMode: boolean;
  steerDraft: string;
  pendingSteers: PendingSteer[];
  downvotedRunKeys: Set<string>;
  eventPopoverIndex: number;
  eventPopoverEventRef: AgentEvent | null;
  eventPopoverAnchor: { x: number; y: number } | null;
  commandModal: CommandModalState;
}

/* ============================================
   Services (injected dependencies)
   ============================================ */
export interface Services {
  actionRuntime: ActionRuntime | null;
  [key: string]: unknown;
}
