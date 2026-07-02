export interface ChatAwaitingSummary {
	awaitingId?: string;
	runId?: string;
	mode?: string;
	status?: string;
	createdAt?: number;
	[key: string]: unknown;
}

export interface ChatActiveRunSummary {
	runId?: string;
	agentKey?: string;
	lastSeq?: number | string;
	planningMode?: boolean;
	[key: string]: unknown;
}

export interface Chat {
	chatId: string;
	chatName?: string;
	firstAgentName?: string;
	firstAgentKey?: string;
	agentKey?: string;
	teamId?: string;
	updatedAt?: number;
	lastRunId?: string;
	lastRunContent?: string;
	read?: ChatReadState;
	awaiting?: ChatAwaitingSummary | null;
	hasPendingAwaiting?: boolean;
	activeRun?: ChatActiveRunSummary | null;
	hasActiveRun?: boolean;
	[key: string]: unknown;
}

export interface ChatReadState {
	isRead: boolean;
	readAt?: number;
	readRunId?: string;
}

export interface Agent {
	key: string;
	name: string;
	type?: "agent" | "coder";
	mode?: string;
	workspaceDir?: string;
	workspaceName?: string;
	source?: {
		kind?: string;
		path?: string;
		agentDir?: string;
		[key: string]: unknown;
	};
	role?: string;
	wonders?: string[];
	controls?: AgentControl[];
	modelConfig?: Record<string, unknown>;
	modelOptions?: Record<string, unknown>;
	stats?: AgentStats;
	icon?: string | {
		color?: string;
		name?: string;
	}
	[key: string]: unknown;
}

export interface AgentStats {
	totalCount?: number;
	unreadCount?: number;
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
	agentType?: "agent" | "coder" | "kbase";
	sourceId: string;
	displayName: string;
	role: string;
	workspaceDir?: string;
	workspaceName?: string;
	workspaceSourceKind?: string;
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
	agentKey?: string;
	teamId?: string;
	updatedAt: number;
	lastRunId: string;
	lastRunContent: string;
	searchSnippet?: string;
	read?: ChatReadState;
	isRead?: boolean;
	hasPendingAwaiting?: boolean;
	awaitingMode?: string;
	hasActiveRun?: boolean;
}
