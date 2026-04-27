import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";
import { upsertChatSummary } from "@/features/chats/lib/chatSummary";
import { setMapValue } from "@/app/state/reducerHelpers";
import {
	markAgentChatsRead,
	markWorkerRowsRead,
	upsertAgentUnreadCount,
} from "@/features/chats/lib/chatReadState";

export function reduceNavigationState(
	state: AppState,
	action: AppAction,
): AppState | null {
	switch (action.type) {
		case "SET_AGENTS":
			return { ...state, agents: action.agents };
		case "SET_TEAMS":
			return { ...state, teams: action.teams };
		case "SET_CHATS":
			return { ...state, chats: action.chats };
		case "START_SIDEBAR_REQUEST":
			return {
				...state,
				sidebarPendingRequestCount: state.sidebarPendingRequestCount + 1,
			};
		case "FINISH_SIDEBAR_REQUEST":
			return {
				...state,
				sidebarPendingRequestCount: Math.max(
					0,
					state.sidebarPendingRequestCount - 1,
				),
			};
		case "UPSERT_CHAT":
			return {
				...state,
				chats: upsertChatSummary(state.chats, action.chat),
			};
		case "CHAT_DELETED": {
			const chatId = String(action.chatId || "");
			return {
				...state,
				chats: state.chats.filter((chat) => String(chat.chatId || "") !== chatId),
				workerRelatedChats: state.workerRelatedChats.filter(
					(chat) => String(chat.chatId || "") !== chatId,
				),
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
		case "SET_CHAT_FILTER":
			return { ...state, chatFilter: action.filter };
		case "SET_CONVERSATION_MODE":
			return { ...state, conversationMode: action.mode };
		case "SET_WORKER_SELECTION_KEY":
			return { ...state, workerSelectionKey: action.workerKey };
		case "SET_WORKER_ROWS": {
			const workerIndexByKey = new Map(
				action.rows.map((row) => [row.key, row]),
			);
			const workerSelectionKey = workerIndexByKey.has(
				state.workerSelectionKey,
			)
				? state.workerSelectionKey
				: "";
			return {
				...state,
				workerRows: action.rows,
				workerIndexByKey,
				workerSelectionKey,
			};
		}
		case "SET_WORKER_RELATED_CHATS":
			return { ...state, workerRelatedChats: action.chats };
		case "SET_WORKER_CHAT_PANEL_COLLAPSED":
			return { ...state, workerChatPanelCollapsed: action.collapsed };
		case "SET_DESKTOP_DEBUG_SIDEBAR_ENABLED":
			return { ...state, desktopDebugSidebarEnabled: action.enabled };
		case "SET_PENDING_NEW_CHAT_AGENT_KEY":
			return { ...state, pendingNewChatAgentKey: action.agentKey };
		case "SET_WORKER_PRIORITY_KEY":
			return { ...state, workerPriorityKey: action.workerKey };
		case "SET_CHAT_AGENT_BY_ID":
			return {
				...state,
				chatAgentById: setMapValue(
					state.chatAgentById,
					action.chatId,
					action.agentKey,
				),
			};
		default:
			return null;
	}
}
