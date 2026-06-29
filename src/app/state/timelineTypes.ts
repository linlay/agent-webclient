import type { ContentSegment } from "@/features/timeline/lib/contentSegments";

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
	title?: string;
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
	viewportKey?: string;
	description?: string;
	argsText?: string;
	result?: ToolResultPayload | null;
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
	embeddedViewports?: Record<string, EmbeddedViewport>;
	ttsVoiceBlocks?: Record<string, TtsVoiceBlock>;
}
