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
  defaultAccessLevel?: "ask_for_approval" | "auto_approve" | "full_access";
  teamConfig?: { members: string[]; maxParallel?: number };
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
  meta?: Record<string, unknown>;
  skills?: string[];
  connectors?: string[];
  wonders?: string[];
  controls?: AgentControl[];
  modelKey?: string;
  reasoningEffort?: import("@/shared/data/api/dto/models").QueryReasoningEffort;
  serviceTier?: string;
  modelConfig?: Record<string, unknown>;
  modelOptions?: Record<string, unknown>;
  stats?: AgentStats;
  chats?: Chat[];
  primaryChat?: Chat;
  icon?: string | { color?: string; name?: string };
  [key: string]: unknown;
}

/** /api/agents navigation data. It cannot carry Composer execution metadata. */
export type AgentSummary = Pick<Agent,
  "key" | "name" | "kind" | "type" | "mode" | "workspaceDir" | "workspaceName" |
  "agentConfigDir" | "source" | "role" | "icon" | "stats" | "chats" | "primaryChat" |
  "defaultAccessLevel" | "modelConfig" | "modelOptions">;

export interface AgentsState {
  agents: AgentSummary[];
  /** Authoritative current definition, written only by detail reads/confirmed mutations. */
  currentAgent: Agent | null;
  agentAvailability: Record<string, AgentAvailability>;
}

export type AgentAvailability = "checking" | "available" | "unavailable" | "authentication_required" | "forbidden" | "error";

export type AgentsAction = { type: "CLEAR_AGENT_AVAILABILITY" } | { type: "SET_AGENTS"; agents: AgentSummary[] }
  | { type: "SET_CURRENT_AGENT"; agent: Agent | null }
  | { type: "PATCH_CURRENT_AGENT"; agentKey: string; patch: Partial<Agent> }
  | { type: "SET_AGENT_AVAILABILITY"; agentKey: string; status: AgentAvailability };

export function createInitialAgentsState(): AgentsState {
  return { agents: [], currentAgent: null, agentAvailability: {} };
}

export function reduceAgentsState<S extends AgentsState>(state: S, action: AgentsAction): S;
export function reduceAgentsState<S extends AgentsState>(state: S, action: { type: string }): S | null;
export function reduceAgentsState<S extends AgentsState>(state: S, input: { type: string }): S | null {
  const action = input as AgentsAction;
  switch (action.type) {
    case "CLEAR_AGENT_AVAILABILITY": return { ...state, currentAgent: null, agentAvailability: {} };
    case "SET_AGENT_AVAILABILITY":
      return { ...state, agentAvailability: { ...state.agentAvailability, [action.agentKey]: action.status } };
    case "SET_CURRENT_AGENT":
      return { ...state, currentAgent: currentAgentDefinition(action.agent) };
    case "PATCH_CURRENT_AGENT":
      return state.currentAgent?.key === action.agentKey
        ? { ...state, currentAgent: { ...state.currentAgent, ...action.patch, key: action.agentKey } }
        : state;
    case "SET_AGENTS":
      return { ...state, agents: action.agents };
    default: return null;
  }
}

/** Never fall back to /api/agents for a current execution definition. */
export function selectCurrentAgent(state: { currentAgent?: Agent | null }, agentKey: string): Agent | null {
  return state.currentAgent?.key === agentKey ? state.currentAgent : null;
}

/** Workspace belongs to the detail contract's meta, independently of directory paths. */
function currentAgentDefinition(agent: Agent | null): Agent | null {
  const workspace = agent?.meta?.workspace;
  if (!agent || !workspace || typeof workspace !== "object" || Array.isArray(workspace)) return agent;
  const root = (workspace as Record<string, unknown>).root;
  if (typeof root !== "string" || root.trim() === agent.workspaceDir) return agent;
  return { ...agent, workspaceDir: root.trim() };
}
