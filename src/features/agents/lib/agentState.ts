import type { Chat } from "@/features/chats/lib/chatState";

export interface AgentStats {
  totalCount?: number;
  unreadCount?: number;
}

export interface AgentControlOption {
  value: any;
  label: any;
  type?: "text" | "img";
}

export interface AgentControl {
  type: "switch" | "select" | "string" | "number" | "date";
  icon: any;
  key: string;
  label: string;
  options?: AgentControlOption[];
  defaultValue?: any;
}

export interface Agent {
  key: string;
  name: string;
  kind?: "agent";
  type?: "agent" | "coder";
  mode?: string;
  workspaceDir?: string;
  workspaceName?: string;
  agentConfigDir?: string;
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
  chats?: Chat[];
  icon?: string | { color?: string; name?: string };
  [key: string]: unknown;
}

export interface AgentsState {
  agents: Agent[];
}

export type AgentsAction = { type: "SET_AGENTS"; agents: Agent[] };

export function createInitialAgentsState(): AgentsState {
  return { agents: [] };
}

export function reduceAgentsState<S extends AgentsState>(state: S, action: AgentsAction): S;
export function reduceAgentsState<S extends AgentsState>(state: S, action: { type: string }): S | null;
export function reduceAgentsState<S extends AgentsState>(state: S, input: { type: string }): S | null {
  const action = input as AgentsAction;
  switch (action.type) {
    case "SET_AGENTS":
      return { ...state, agents: action.agents };
    default: return null;
  }
}
