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
