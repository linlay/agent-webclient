import type {
  CoderModelOptionsResponse,
  QueryReasoningEffort,
  QueryServiceTier,
  AgentEditorModelOption,
} from "@/shared/data/api/dto/models";
import type {
  AdminSkillStatus,
} from "@/shared/data/api/dto/skills";
import type { AgentSource } from "@/shared/data/api/dto/admin";

export interface GetAgentsOptions {
  includeChats?: number;
  includeTeam?: boolean;
  scope?: "nav" | "copilot" | "invoke" | "internal" | "all";
  mode?: string | string[];
}

export interface AgentOrderResponse {
  version: number;
  order: string[];
  updatedAt?: number;
}

export interface UpdateAgentOrderRequest {
  order: string[];
}

export interface AgentDetailResponse {
  key: string;
  name: string;
  type?: "agent" | "coder";
  workspaceDir?: string;
  workspaceName?: string;
  icon?: unknown;
  description?: string;
  role?: string;
  greetings?: string[];
  wonders?: string[];
  model: string;
  mode: string;
  tools: string[];
  skills: string[];
  controls: Array<Record<string, unknown>>;
  meta: Record<string, unknown>;
  modelConfig?: Record<string, unknown>;
  modelOptions?: CoderModelOptionsResponse;
  definition?: Record<string, unknown>;
  soulPrompt?: string;
  agentsPrompt?: string;
  source?: AgentSource;
}

export interface AgentSkill {
  key: string;
  name: string;
  description?: string;
  agentHasSkill: boolean;
}

export interface AgentSkillsResponse {
  agentKey: string;
  skills: AgentSkill[];
}

export interface AdminAgentDiagnostic {
  severity: string;
  code: string;
  message: string;
  sourcePath?: string;
}

export interface AdminAgentSummary {
  key: string;
  name: string;
  type?: "agent" | "coder";
  workspaceDir?: string;
  workspaceName?: string;
  icon?: unknown;
  description?: string;
  role?: string;
  model?: string;
  mode?: string;
  tools?: string[];
  skills?: string[];
  controls?: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
  status: "ready" | "invalid" | string;
  diagnostics?: AdminAgentDiagnostic[];
  source?: AgentSource;
  [key: string]: unknown;
}

export interface AdminAgentDetailResponse extends Omit<AgentDetailResponse, "model" | "mode" | "tools" | "skills" | "controls" | "meta"> {
  model?: string;
  mode?: string;
  tools?: string[];
  skills?: string[];
  controls?: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
  status: "ready" | "invalid" | string;
  diagnostics?: AdminAgentDiagnostic[];
  privateSkills?: AdminAgentPrivateSkill[];
}

export interface AdminAgentPrivateSkill {
  key: string;
  name: string;
  description?: string;
  status: AdminSkillStatus;
  diagnostics?: AdminAgentDiagnostic[];
  enabled: boolean;
  overridesCenter: boolean;
}

export interface CreateAgentRequest {
  key?: string;
  definition: Record<string, unknown>;
  soulPrompt?: string;
  agentsPrompt?: string;
}

export interface ImportAgentArchiveRequest {
  file: File;
  overwrite?: boolean;
}

export interface UpdateAgentRequest {
  key: string;
  definition: Record<string, unknown>;
  soulPrompt?: string;
  agentsPrompt?: string;
}

export interface UpdateAgentNameRequest {
  key?: string;
  agentKey?: string;
  name: string;
}

export interface UpdateAgentModelConfigRequest {
  key?: string;
  agentKey?: string;
  modelKey: string;
  reasoningEffort?: QueryReasoningEffort;
  serviceTier?: QueryServiceTier;
}

export interface AgentModelConfigResponse {
  key: string;
  modelConfig: Record<string, unknown>;
}

export interface DeleteAgentRequest {
  key: string;
}

export interface DeleteAgentResponse {
  key: string;
  deleted: boolean;
}

export type AgentDirectoryType = "workspace" | "config";

export interface OpenAgentDirectoryRequest {
  agentKey: string;
  directoryType: AgentDirectoryType;
}

export interface OpenAgentDirectoryResponse {
  agentKey: string;
  directoryType: AgentDirectoryType;
  directoryPath: string;
  opened: boolean;
}

export interface AgentEditorOption {
  key: string;
  label: string;
}

export interface AgentEditorProxyConfigField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
}

export interface AgentEditorProxyConfigSchema {
  fields: AgentEditorProxyConfigField[];
  defaultTimeoutMs: number;
}

export interface AgentEditorOptionsResponse {
  models: AgentEditorModelOption[];
  contextTags: AgentEditorOption[];
  visibilityScopes?: AgentEditorOption[];
  modes: AgentEditorOption[];
  proxyConfigSchema: AgentEditorProxyConfigSchema;
}
