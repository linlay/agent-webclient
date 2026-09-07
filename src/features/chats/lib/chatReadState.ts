import type { Agent } from "@/features/agents/lib/agentState";
import type { Chat, ChatReadState } from "@/features/chats/lib/chatState";
import type { Team, WorkerConversationRow, WorkerRow } from "@/features/workers/lib/workerState";
import { toText } from "@/shared/utils/eventUtils";
import { readEpochMillis } from "@/shared/utils/platformTime";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === "object";
}

export function normalizeChatReadState(value: unknown): ChatReadState | undefined {
	if (!isObjectRecord(value)) {
		return undefined;
	}

	const isRead = value.isRead === false ? false : true;
	const readAt = readEpochMillis(value.readAt);
	const readRunId = toText(value.readRunId);

	return {
		isRead,
		...(readAt !== undefined ? { readAt } : {}),
		...(readRunId ? { readRunId } : {}),
	};
}

function parseRunIdMillis(runId: string): number | undefined {
	const normalized = toText(runId).toLowerCase();
	if (!normalized || !/^[0-9a-z]+$/.test(normalized)) {
		return undefined;
	}
	const millis = Number.parseInt(normalized, 36);
	return Number.isSafeInteger(millis) ? millis : undefined;
}

/** Mirrors Agent Platform's chat.RunIDAfter ordering contract. */
export function isRunIdAfter(runId: string, cursor: string): boolean {
	const normalizedRunId = toText(runId);
	const normalizedCursor = toText(cursor);
	const runMillis = parseRunIdMillis(normalizedRunId);
	const cursorMillis = parseRunIdMillis(normalizedCursor);
	if (runMillis !== undefined && cursorMillis !== undefined && runMillis !== cursorMillis) {
		return runMillis > cursorMillis;
	}
	return normalizedRunId.localeCompare(normalizedCursor) > 0;
}

export function mergeChatReadState(input: {
	existing?: ChatReadState;
	incoming?: ChatReadState;
	existingLastRunId?: string;
	incomingLastRunId?: string;
	existingUpdatedAt?: number;
	incomingUpdatedAt?: number;
}): ChatReadState | undefined {
	const { existing, incoming } = input;
	if (!incoming) return existing;
	if (!existing) return incoming;

	const existingLastRunId = toText(input.existingLastRunId);
	const incomingLastRunId = toText(input.incomingLastRunId) || existingLastRunId;
	const existingReadRunId = toText(existing.readRunId);
	const incomingReadRunId = toText(incoming.readRunId);

	if (incoming.isRead) {
		if (incomingReadRunId) {
			if (existingLastRunId && isRunIdAfter(existingLastRunId, incomingReadRunId)) {
				return existing;
			}
			if (existingReadRunId && isRunIdAfter(existingReadRunId, incomingReadRunId)) {
				return existing;
			}
			if (
				existing.isRead &&
				existingReadRunId === incomingReadRunId &&
				(existing.readAt ?? 0) > (incoming.readAt ?? 0)
			) {
				return existing;
			}
			return incoming;
		}
		if ((existing.readAt ?? 0) > (incoming.readAt ?? 0)) {
			return existing;
		}
		return incoming;
	}

	if (incomingLastRunId) {
		if (incomingReadRunId && !isRunIdAfter(incomingLastRunId, incomingReadRunId)) {
			return existing;
		}
		if (existingLastRunId && isRunIdAfter(existingLastRunId, incomingLastRunId)) {
			return existing;
		}
		if (existing.isRead && existingReadRunId && !isRunIdAfter(incomingLastRunId, existingReadRunId)) {
			return existing;
		}
	} else if (
		existing.isRead &&
		(existing.readAt ?? 0) >= (input.incomingUpdatedAt ?? 0)
	) {
		return existing;
	}

	return {
		...incoming,
		...(incoming.readAt === undefined && existing.readAt !== undefined
			? { readAt: existing.readAt }
			: {}),
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
	teams: Team[],
	chats: Chat[],
): number {
	if (!worker) {
		return 0;
	}
	if (worker.type === "team") {
		const teamId = toText(worker.sourceId);
		const matched = (Array.isArray(teams) ? teams : []).find(
			(team) => toText(team?.teamId) === teamId,
		);
		const statsUnread = Number(matched?.stats?.unreadCount);
		if (Number.isFinite(statsUnread) && statsUnread >= 0) {
			return statsUnread;
		}
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
