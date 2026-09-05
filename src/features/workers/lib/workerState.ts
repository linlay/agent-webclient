import type { Agent, AgentStats } from "@/features/agents/lib/agentState";
import type { Chat, ChatReadState } from "@/features/chats/lib/chatState";

export interface Team {
  teamId: string;
  kind?: "team";
  name?: string;
  role?: string;
  agentKey?: string;
  agentKeys?: string[];
  agents?: Array<string | { key?: string; agentKey?: string }>;
  members?: Array<string | { key?: string; agentKey?: string }>;
  runtimeMode?: string;
  meta?: Record<string, unknown>;
  icon?: { color?: string; name?: string };
  stats?: AgentStats;
  chats?: Chat[];
  [key: string]: unknown;
}

export type WorkerListItem = Agent | Team;

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
  chatId: string;
  chatName: string;
  agentKey?: string;
  teamId?: string;
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
  teams: Team[];
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
  | { type: "SET_TEAMS"; teams: Team[] }
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
    teams: [],
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

export function reduceWorkersState(state: WorkersState, action: WorkersAction): WorkersState {
  switch (action.type) {
    case "SET_TEAMS": return { ...state, teams: action.teams };
    case "START_SIDEBAR_REQUEST": return { ...state, sidebarPendingRequestCount: state.sidebarPendingRequestCount + 1 };
    case "FINISH_SIDEBAR_REQUEST": return { ...state, sidebarPendingRequestCount: Math.max(0, state.sidebarPendingRequestCount - 1) };
    case "SET_CHAT_FILTER": return { ...state, chatFilter: action.filter };
    case "SET_WORKER_SELECTION_KEY": return { ...state, workerSelectionKey: action.workerKey };
    case "SET_WORKER_ROWS": return { ...state, workerRows: action.rows };
    case "SET_WORKER_ORDER_KEYS": return { ...state, workerOrderKeys: action.workerOrderKeys };
    case "SET_WORKER_RELATED_CHATS": return { ...state, workerRelatedChats: action.chats };
    case "SET_WORKER_CHAT_PANEL_COLLAPSED": return { ...state, workerChatPanelCollapsed: action.collapsed };
    case "SET_PENDING_NEW_CHAT_AGENT_KEY": return { ...state, pendingNewChatAgentKey: action.agentKey };
    case "SET_WORKER_PRIORITY_KEY": return { ...state, workerPriorityKey: action.workerKey };
    case "SET_TEMPORARY_PINNED_AGENT_KEY": return { ...state, temporaryPinnedAgentKey: action.agentKey };
  }
}
