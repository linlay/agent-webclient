import type { ContentSegment } from "@/shared/contracts/contentSegments";
import type { UiTimerHandle } from "@/shared/contracts/ui";

export type TimelineNodeKind =
	| "message"
	| "thinking"
	| "awaiting-answer"
	| "tool"
	| "source"
	| "content"
	| "agent-group"
	| "planning";
export type TimelineRole = "user" | "assistant" | "system" | "";

export interface ToolResultPayload {
	text: string;
	isCode: boolean;
}

export type ToolOutputStream = "stdout" | "stderr";

export interface ToolOutputSegment {
	stream: ToolOutputStream;
	text: string;
	truncationMarker?: boolean;
}

export interface ToolOutputState {
	segments: ToolOutputSegment[];
	lastChunkIndex: number;
	truncated: boolean;
}

export interface TimelineAttachment {
	id?: string;
	name: string;
	size?: number;
	type?: string;
	mimeType?: string;
	url?: string;
	previewUrl?: string;
	meta?: Record<string, unknown>;
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

export interface TimelineSourceChunk {
	chunkId: string;
	index: number;
	content: string;
	score?: number;
	timestamp?: number;
	path?: string;
	heading?: string;
	startLine?: number;
	endLine?: number;
	pageStart?: number;
	pageEnd?: number;
	slideStart?: number;
	slideEnd?: number;
	sourceType?: string;
	matchType?: string;
}

export interface TimelineSource {
	id: string;
	name: string;
	title?: string;
	icon?: string;
	url?: string;
	link?: string;
	collectionId?: string;
	collectionName?: string;
	chunkIndexes: number[];
	minIndex: number;
	chunks: TimelineSourceChunk[];
}

export interface TimelineErrorDetail {
	code: string;
	category: string;
	scope: string;
	status: number | null;
	retryable: boolean | null;
	message: string;
	diagnostics: unknown;
	raw: unknown;
	technicalText: string;
}

export interface TimelineNode {
	id: string;
	kind: TimelineNodeKind;
	role?: TimelineRole;
	messageVariant?: "default" | "steer" | "remember" | "learn" | "compact";
	steerId?: string;
	awaitingId?: string;
	reasoningLabel?: string;
	planningId?: string;
	title?: string;
	tooltip?: string;
	text?: string;
	attachments?: TimelineAttachment[];
	status?: string;
	expanded?: boolean;
	ts: number;
	taskId?: string;
	taskName?: string;
	taskGroupId?: string;
	subAgentKey?: string;
	groupId?: string;
	mainToolId?: string;
	toolId?: string;
	toolLabel?: string;
	toolName?: string;
	view?: import("@/shared/contracts/view").ViewReference;
	viewError?: string;
	viewChatId?: string;
	viewportKey?: string;
	description?: string;
	argsText?: string;
	result?: ToolResultPayload | null;
	toolOutput?: ToolOutputState;
	startedAt?: number;
	endedAt?: number;
	durationMs?: number;
	contentId?: string;
	segments?: ContentSegment[];
	sourcePublishId?: string;
	sourceKind?: string;
	sourceQuery?: string;
	sourceCount?: number;
	chunkCount?: number;
	sources?: TimelineSource[];
	errorDetail?: TimelineErrorDetail;
	mustUseSkills?: string[];
	embeddedViewports?: Record<string, EmbeddedViewport>;
	ttsVoiceBlocks?: Record<string, TtsVoiceBlock>;
}

export interface RenderQueue {
  dirtyNodeIds: Set<string>;
  scheduled: boolean;
  stickToBottomRequested: boolean;
  fullSyncNeeded: boolean;
}

export interface TimelineState {
  timelineNodes: Map<string, TimelineNode>;
  timelineOrder: string[];
  timelineNodeByMessageId: Map<string, string>;
  timelineDomCache: Map<string, HTMLElement>;
  timelineCounter: number;
  renderQueue: RenderQueue;
  toolNodeById: Map<string, string>;
  contentNodeById: Map<string, string>;
  reasoningNodeById: Map<string, string>;
  reasoningCollapseTimers: Map<string, number>;
  activeReasoningKey: string;
}

export type TimelineAction =
  | { type: "SET_TIMELINE_NODE"; id: string; node: TimelineNode }
  | { type: "PATCH_CONTENT_TTS_VOICE_BLOCK"; nodeId: string; signature: string; patch: Partial<TtsVoiceBlock> }
  | { type: "REMOVE_INACTIVE_CONTENT_TTS_VOICE_BLOCKS"; nodeId: string; activeSignatures: Set<string> }
  | { type: "APPEND_TIMELINE_ORDER"; id: string }
  | { type: "INCREMENT_TIMELINE_COUNTER" }
  | { type: "SET_CONTENT_NODE_BY_ID"; contentId: string; nodeId: string }
  | { type: "SET_REASONING_NODE_BY_ID"; reasoningId: string; nodeId: string }
  | { type: "SET_REASONING_COLLAPSE_TIMER"; reasoningId: string; timer: UiTimerHandle }
  | { type: "CLEAR_REASONING_COLLAPSE_TIMER"; reasoningId: string }
  | { type: "SET_TOOL_NODE_BY_ID"; toolId: string; nodeId: string }
  | { type: "SET_ACTIVE_REASONING_KEY"; key: string };

export function createInitialTimelineState(): TimelineState {
  return {
    timelineNodes: new Map(), timelineOrder: [], timelineNodeByMessageId: new Map(),
    timelineDomCache: new Map(), timelineCounter: 0,
    renderQueue: { dirtyNodeIds: new Set(), scheduled: false, stickToBottomRequested: false, fullSyncNeeded: false },
    toolNodeById: new Map(), contentNodeById: new Map(), reasoningNodeById: new Map(),
    reasoningCollapseTimers: new Map(), activeReasoningKey: "",
  };
}

export function reduceTimelineState<S extends TimelineState>(state: S, action: TimelineAction): S;
export function reduceTimelineState<S extends TimelineState>(state: S, action: { type: string }): S | null;
export function reduceTimelineState<S extends TimelineState>(state: S, input: { type: string }): S | null {
  const action = input as TimelineAction;
  switch (action.type) {
    case "SET_TIMELINE_NODE":
      return { ...state, timelineNodes: new Map(state.timelineNodes).set(action.id, action.node) };
    case "APPEND_TIMELINE_ORDER":
      return { ...state, timelineOrder: [...state.timelineOrder, action.id] };
    case "SET_CONTENT_NODE_BY_ID":
      return { ...state, contentNodeById: new Map(state.contentNodeById).set(action.contentId, action.nodeId) };
    case "SET_REASONING_NODE_BY_ID":
      return { ...state, reasoningNodeById: new Map(state.reasoningNodeById).set(action.reasoningId, action.nodeId) };
    case "SET_REASONING_COLLAPSE_TIMER":
      return {
        ...state,
        reasoningCollapseTimers: new Map(state.reasoningCollapseTimers).set(action.reasoningId, action.timer),
      };
    case "CLEAR_REASONING_COLLAPSE_TIMER": {
      const timers = state.reasoningCollapseTimers;
      if (!timers.has(action.reasoningId)) return { ...state, reasoningCollapseTimers: timers };
      const next = new Map(timers);
      next.delete(action.reasoningId);
      return { ...state, reasoningCollapseTimers: next };
    }
    case "SET_TOOL_NODE_BY_ID":
      return { ...state, toolNodeById: new Map(state.toolNodeById).set(action.toolId, action.nodeId) };
    case "SET_ACTIVE_REASONING_KEY":
      return { ...state, activeReasoningKey: action.key };
    case "INCREMENT_TIMELINE_COUNTER":
      return { ...state, timelineCounter: state.timelineCounter + 1 };
    case "PATCH_CONTENT_TTS_VOICE_BLOCK":
    case "REMOVE_INACTIVE_CONTENT_TTS_VOICE_BLOCKS": return state;
    default: return null;
  }
}
