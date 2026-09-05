import type { RunOwner } from "@/shared/data/runOwner";

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
  teamId?: string;
  owner?: RunOwner;
  lastSeq?: number | string;
  planningMode?: boolean;
  editingMode?: boolean;
  [key: string]: unknown;
}

export type CurrentChatActiveRun = ChatActiveRunSummary & { chatId: string };

export interface ChatReadState {
  isRead: boolean;
  readAt?: number;
  readRunId?: string;
}

export interface Chat {
  chatId: string;
  chatName?: string;
  firstAgentName?: string;
  firstAgentKey?: string;
  agentKey?: string;
  teamId?: string;
  owner?: RunOwner;
  source?: string;
  updatedAt?: number;
  lastRunId?: string;
  lastRunContent?: string;
  searchSnippet?: string;
  read?: ChatReadState;
  awaiting?: ChatAwaitingSummary | null;
  hasPendingAwaiting?: boolean;
  activeRun?: ChatActiveRunSummary | null;
  hasActiveRun?: boolean;
  [key: string]: unknown;
}

export interface ChatsState {
  chats: Chat[];
  currentChatActiveRun: CurrentChatActiveRun | null;
}

export type ChatsAction =
  | { type: "SET_CHATS"; chats: Chat[] }
  | { type: "UPSERT_CHAT"; chat: Partial<Chat> & Pick<Chat, "chatId"> }
  | { type: "CHAT_DELETED"; chatId: string }
  | { type: "CHAT_ARCHIVED"; chatId: string }
  | { type: "CHAT_RENAMED"; chatId: string; chatName: string }
  | { type: "MARK_AGENT_CHATS_READ"; agentKey: string }
  | { type: "SET_CURRENT_CHAT_ACTIVE_RUN"; activeRun: CurrentChatActiveRun | null };

export function createInitialChatsState(): ChatsState {
  return { chats: [], currentChatActiveRun: null };
}

export function reduceChatsState(state: ChatsState, action: ChatsAction): ChatsState {
  switch (action.type) {
    case "SET_CHATS": return { ...state, chats: action.chats };
    case "UPSERT_CHAT": {
      const index = state.chats.findIndex((chat) => chat.chatId === action.chat.chatId);
      if (index < 0) return { ...state, chats: [...state.chats, action.chat as Chat] };
      const chats = [...state.chats];
      chats[index] = { ...chats[index], ...action.chat };
      return { ...state, chats };
    }
    case "CHAT_DELETED":
    case "CHAT_ARCHIVED": return { ...state, chats: state.chats.filter((chat) => chat.chatId !== action.chatId) };
    case "CHAT_RENAMED": return { ...state, chats: state.chats.map((chat) => chat.chatId === action.chatId ? { ...chat, chatName: action.chatName } : chat) };
    case "MARK_AGENT_CHATS_READ": return { ...state, chats: state.chats.map((chat) => chat.agentKey === action.agentKey ? { ...chat, read: { isRead: true } } : chat) };
    case "SET_CURRENT_CHAT_ACTIVE_RUN": return { ...state, currentChatActiveRun: action.activeRun };
  }
}
