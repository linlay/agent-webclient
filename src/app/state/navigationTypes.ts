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
	read?: ChatReadState;
	hasPendingAwaiting?: boolean;
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
	role?: string;
	wonders?: string[];
	controls?: AgentControl[];
	stats?: AgentStats;
	icon?: {
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
	read?: ChatReadState;
	isRead?: boolean;
	hasPendingAwaiting?: boolean;
}
