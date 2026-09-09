import { applyChatPinnedOrder } from "@/features/chats/lib/chatPinning";
import { reduceChatPinningState } from "@/features/chats/lib/chatPinningState";
import { reduceAgentsState } from "@/features/agents/lib/agentState";
import { reduceWorkersState } from "@/features/workers/lib/workerState";
import { reduceAutomationsState } from "@/features/automations/lib/automationsState";
import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";
import type { Chat } from "@/features/chats/lib/chatState";
import { upsertChatSummary } from "@/features/chats/lib/chatSummary";
import { setMapValue } from "@/app/state/reducerHelpers";
import {
	markAgentChatsRead,
	markWorkerRowsRead,
	upsertAgentUnreadCount,
} from "@/features/chats/lib/chatReadState";

function syncChatAgentBinding(
	source: Map<string, string>,
	chat: Partial<Chat> | null | undefined,
): Map<string, string> {
	const chatId = String(chat?.chatId || "").trim();
	if (chat?.owner?.kind === "orchestrated-team" || String(chat?.teamId || "").trim()) {
		if (!chatId || !source.has(chatId)) {
			return source;
		}
		const next = new Map(source);
		next.delete(chatId);
		return next;
	}
	const agentKey = String(chat?.agentKey || chat?.firstAgentKey || "").trim();
	if (!chatId || !agentKey || source.get(chatId) === agentKey) {
		return source;
	}
	const next = new Map(source);
	next.set(chatId, agentKey);
	return next;
}

function syncChatAgentBindings(
	source: Map<string, string>,
	chats: Array<Partial<Chat>>,
): Map<string, string> {
	return chats.reduce(syncChatAgentBinding, source);
}

function resolveChatAgentKey(chat: Partial<Chat> | null | undefined): string {
	return String(chat?.agentKey || chat?.firstAgentKey || "").trim();
}

function hasLastRunForTemporaryPinnedAgent(
	chats: Array<Partial<Chat>>,
	agentKey: string,
): boolean {
	const normalizedAgentKey = String(agentKey || "").trim();
	if (!normalizedAgentKey) {
		return false;
	}
	return chats.some((chat) => (
		resolveChatAgentKey(chat) === normalizedAgentKey
		&& Boolean(String(chat?.lastRunId || "").trim())
	));
}

function clearTemporaryPinForChats(
	state: AppState,
	chats: Array<Partial<Chat>>,
): string {
	return hasLastRunForTemporaryPinnedAgent(chats, state.temporaryPinnedAgentKey)
		? ""
		: state.temporaryPinnedAgentKey;
}

export function reduceNavigationState(
	state: AppState,
	action: AppAction,
): AppState | null {
	switch (action.type) {
		case "SET_CHATS":
			return {
				...state,
				chats: applyChatPinnedOrder(action.chats, state.chatPinnedOrder),
				temporaryPinnedAgentKey: clearTemporaryPinForChats(state, action.chats),
				chatAgentById: syncChatAgentBindings(
					state.chatAgentById,
					action.chats,
				),
			};
		case "UPSERT_CHAT": {
			const chats = applyChatPinnedOrder(upsertChatSummary(state.chats, action.chat), state.chatPinnedOrder);
			return {
				...state,
				chats,
				temporaryPinnedAgentKey: clearTemporaryPinForChats(state, chats),
				chatAgentById: syncChatAgentBinding(
					state.chatAgentById,
					action.chat,
				),
			};
		}
		case "CHAT_DELETED":
		case "CHAT_ARCHIVED": {
			const chatId = String(action.chatId || "");
			return {
				...state,
				chats: state.chats.filter((chat) => String(chat.chatId || "") !== chatId),
				chatPinnedOrder: state.chatPinnedOrder?.filter((id) => id !== chatId) ?? null,
				workerRelatedChats: state.workerRelatedChats.filter(
					(chat) => String(chat.chatId || "") !== chatId,
				),
			};
		}
		case "CHAT_RENAMED": {
			const chatId = String(action.chatId || "").trim();
			const chatName = String(action.chatName || "").trim();
			if (!chatId || !chatName) {
				return state;
			}
			const renameChat = <T extends { chatId?: string; chatName?: string }>(
				chat: T,
			): T =>
				String(chat.chatId || "") === chatId ? { ...chat, chatName } : chat;
			return {
				...state,
				chats: state.chats.map(renameChat),
				workerRelatedChats: state.workerRelatedChats.map(renameChat),
			};
		}
		case "MARK_AGENT_CHATS_READ": {
			const agentKey = String(action.agentKey || "").trim();
			if (!agentKey) {
				return state;
			}
			return {
				...state,
				chats: markAgentChatsRead(state.chats, agentKey),
				workerRelatedChats: markWorkerRowsRead(state.workerRelatedChats, agentKey),
				agents: upsertAgentUnreadCount(state.agents, agentKey, 0),
			};
		}
		case "SET_CHAT_AGENT_BY_ID":
			return {
				...state,
				chatAgentById: setMapValue(
					state.chatAgentById,
					action.chatId,
					action.agentKey,
				),
			};
		case "SET_WORKER_SELECTION_KEY":
			return {
				...reduceWorkersState(state, action),
				editingMode:
					action.workerKey === state.workerSelectionKey
						? state.editingMode
						: false,
			};
		case "SET_CHAT_PINNING": {
			const next = reduceChatPinningState(state, action)!;
			return { ...next, chatAgentById: syncChatAgentBindings(state.chatAgentById, next.chats) };
		}
		default:
			return reduceChatPinningState(state, action)
				?? reduceAgentsState(state, action)
				?? reduceWorkersState(state, action)
				?? reduceAutomationsState(state, action);
	}
}
