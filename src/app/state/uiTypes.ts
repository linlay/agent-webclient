import type { AIEvent } from "@/app/state/eventTypes";

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

export type UiTimerHandle = number;

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

export interface RenderQueue {
	dirtyNodeIds: Set<string>;
	scheduled: boolean;
	stickToBottomRequested: boolean;
	fullSyncNeeded: boolean;
}
