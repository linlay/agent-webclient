import type { ContentSegment } from "@/features/timeline/lib/contentSegments";

export type TimelineNodeKind =
	| "message"
	| "thinking"
	| "awaiting-answer"
	| "tool"
	| "content"
	| "agent-group";
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
	contentId?: string;
	segments?: ContentSegment[];
	embeddedViewports?: Record<string, EmbeddedViewport>;
	ttsVoiceBlocks?: Record<string, TtsVoiceBlock>;
}
