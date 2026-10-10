import type { Agent } from "@/features/agents/lib/agentState";
import type { Chat, ChatReadState } from "@/features/chats/lib/chatState";


export type WorkerListItem = Agent;

export interface WorkerRow {
  key: string;
  type: "agent";
  agentType?: "agent" | "coder" | "kbase";
  sourceId: string;
  displayName: string;
  role: string;
  workspaceDir?: string;
  workspaceName?: string;
  workspaceSourceKind?: string;
  agentConfigDir?: string;
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
  pinned?: boolean;
  chatId: string;
  chatName: string;
  agentKey?: string;

  source?: string;
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

export interface WorkersState {

  sidebarPendingRequestCount: number;
  pendingNewChatAgentKey: string;
  workerPriorityKey: string;
  temporaryPinnedAgentKey: string;
  chatFilter: string;
  workerSelectionKey: string;
  workerRows: WorkerRow[];
  workerOrderKeys: string[];
  workerIndexByKey: Map<string, WorkerRow>;
  workerRelatedChats: WorkerConversationRow[];
  workerChatPanelCollapsed: boolean;
}

export type WorkersAction =
  | { type: "START_SIDEBAR_REQUEST" }
  | { type: "FINISH_SIDEBAR_REQUEST" }
  | { type: "SET_CHAT_FILTER"; filter: string }
  | { type: "SET_WORKER_SELECTION_KEY"; workerKey: string }
  | { type: "SET_WORKER_ROWS"; rows: WorkerRow[] }
  | { type: "SET_WORKER_ORDER_KEYS"; workerOrderKeys: string[] }
  | { type: "SET_WORKER_RELATED_CHATS"; chats: WorkerConversationRow[] }
  | { type: "SET_WORKER_CHAT_PANEL_COLLAPSED"; collapsed: boolean }
  | { type: "SET_PENDING_NEW_CHAT_AGENT_KEY"; agentKey: string }
  | { type: "SET_WORKER_PRIORITY_KEY"; workerKey: string }
  | { type: "SET_TEMPORARY_PINNED_AGENT_KEY"; agentKey: string };

export function createInitialWorkersState(): WorkersState {
  return {

    sidebarPendingRequestCount: 0,
    pendingNewChatAgentKey: "",
    workerPriorityKey: "",
    temporaryPinnedAgentKey: "",
    chatFilter: "",
    workerSelectionKey: "",
    workerRows: [],
    workerOrderKeys: [],
    workerIndexByKey: new Map(),
    workerRelatedChats: [],
    workerChatPanelCollapsed: true,
  };
}

export function reduceWorkersState<S extends WorkersState>(state: S, action: WorkersAction): S;
export function reduceWorkersState<S extends WorkersState>(state: S, action: { type: string }): S | null;
export function reduceWorkersState<S extends WorkersState>(state: S, input: { type: string }): S | null {
  const action = input as WorkersAction;
  switch (action.type) {
    case "START_SIDEBAR_REQUEST":
      return { ...state, sidebarPendingRequestCount: state.sidebarPendingRequestCount + 1 };
    case "FINISH_SIDEBAR_REQUEST":
      return {
        ...state,
        sidebarPendingRequestCount: Math.max(
          0,
          state.sidebarPendingRequestCount - 1,
        ),
      };
    case "SET_CHAT_FILTER":
      return { ...state, chatFilter: action.filter };
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
    case "SET_WORKER_ORDER_KEYS":
      return { ...state, workerOrderKeys: action.workerOrderKeys };
    case "SET_WORKER_RELATED_CHATS":
      return { ...state, workerRelatedChats: action.chats };
    case "SET_WORKER_CHAT_PANEL_COLLAPSED":
      return { ...state, workerChatPanelCollapsed: action.collapsed };
    case "SET_PENDING_NEW_CHAT_AGENT_KEY":
      return { ...state, pendingNewChatAgentKey: action.agentKey };
    case "SET_WORKER_PRIORITY_KEY":
      return { ...state, workerPriorityKey: action.workerKey };
    case "SET_TEMPORARY_PINNED_AGENT_KEY":
      return { ...state, temporaryPinnedAgentKey: String(action.agentKey || "").trim() };
    default: return null;
  }
}
