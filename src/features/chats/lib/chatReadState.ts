import type { Agent, Chat, ChatReadState, WorkerConversationRow, WorkerRow } from "@/app/state/types";
import { toText } from "@/shared/utils/eventUtils";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === "object";
}

function toFiniteNumber(value: unknown): number | undefined {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : undefined;
}

export function normalizeChatReadState(value: unknown): ChatReadState | undefined {
	if (!isObjectRecord(value)) {
		return undefined;
	}

	const isRead = value.isRead === false ? false : true;
	const readAt = toFiniteNumber(value.readAt);
	const readRunId = toText(value.readRunId);

	return {
		isRead,
		...(readAt !== undefined ? { readAt } : {}),
		...(readRunId ? { readRunId } : {}),
	};
}

export function isChatUnread(
	value: Pick<Chat, "read"> | Pick<WorkerConversationRow, "read" | "isRead"> | null | undefined,
): boolean {
	if (!value) {
		return false;
	}
	if ("isRead" in value && typeof value.isRead === "boolean") {
		return value.isRead === false;
	}
	return value.read?.isRead === false;
}

export function countUnreadChatsForWorker(
	worker: Pick<WorkerRow, "type" | "sourceId"> | null,
	chats: Chat[],
): number {
	if (!worker) {
		return 0;
	}

	return (Array.isArray(chats) ? chats : []).reduce((count, chat) => {
		if (!isChatUnread(chat)) {
			return count;
		}

		if (worker.type === "team" && toText(chat?.teamId) === toText(worker.sourceId)) {
			return count + 1;
		}

		if (
			worker.type === "agent"
			&& toText(chat?.agentKey || chat?.firstAgentKey) === toText(worker.sourceId)
		) {
			return count + 1;
		}

		return count;
	}, 0);
}

export function resolveWorkerUnreadCount(
	worker: Pick<WorkerRow, "type" | "sourceId"> | null,
	agents: Agent[],
	chats: Chat[],
): number {
	if (!worker) {
		return 0;
	}
	if (worker.type === "team") {
		return countUnreadChatsForWorker(worker, chats);
	}

	const agentKey = toText(worker.sourceId);
	const matched = (Array.isArray(agents) ? agents : []).find(
		(agent) => toText(agent?.key) === agentKey,
	);
	const statsUnread = Number(matched?.stats?.unreadCount);
	if (Number.isFinite(statsUnread) && statsUnread >= 0) {
		return statsUnread;
	}

	return countUnreadChatsForWorker(worker, chats);
}

export function upsertAgentUnreadCount(
	agents: Agent[],
	agentKey: string,
	unreadCount: number,
): Agent[] {
	const normalizedAgentKey = toText(agentKey);
	const normalizedUnreadCount = Math.max(0, Number(unreadCount) || 0);
	if (!normalizedAgentKey) {
		return Array.isArray(agents) ? agents : [];
	}
	const currentAgents = Array.isArray(agents) ? agents : [];
	const matchedIndex = currentAgents.findIndex(
		(agent) => toText(agent?.key) === normalizedAgentKey,
	);
	if (matchedIndex < 0) {
		return currentAgents;
	}

	return currentAgents.map((agent, index) => {
		if (index !== matchedIndex) {
			return agent;
		}
		return {
			...agent,
			stats: {
				...(agent?.stats || {}),
				unreadCount: normalizedUnreadCount,
			},
		};
	});
}

const readAllState: ChatReadState = { isRead: true };

export function markAgentChatsRead(chats: Chat[], agentKey: string): Chat[] {
	const normalizedAgentKey = toText(agentKey);
	const currentChats = Array.isArray(chats) ? chats : [];
	if (!normalizedAgentKey) {
		return currentChats;
	}
	let changed = false;
	const nextChats = currentChats.map((chat) => {
		if (toText(chat?.agentKey || chat?.firstAgentKey) !== normalizedAgentKey) {
			return chat;
		}
		if (!isChatUnread(chat)) {
			return chat;
		}
		changed = true;
		return {
			...chat,
			read: {
				...readAllState,
				readRunId: toText(chat?.lastRunId) || chat.read?.readRunId,
			},
		};
	});
	return changed ? nextChats : currentChats;
}

export function markWorkerRowsRead(
	rows: WorkerConversationRow[],
	agentKey: string,
): WorkerConversationRow[] {
	const normalizedAgentKey = toText(agentKey);
	const currentRows = Array.isArray(rows) ? rows : [];
	if (!normalizedAgentKey) {
		return currentRows;
	}
	let changed = false;
	const nextRows = currentRows.map((row) => {
		if (toText(row?.agentKey) !== normalizedAgentKey || !isChatUnread(row)) {
			return row;
		}
		changed = true;
		return {
			...row,
			isRead: true,
			read: {
				...readAllState,
				readRunId: toText(row?.lastRunId) || row.read?.readRunId,
			},
		};
	});
	return changed ? nextRows : currentRows;
}
