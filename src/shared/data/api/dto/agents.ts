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
  chatsPinned?: boolean;
  includeTeam?: boolean;
  hasWorkspace?: boolean;
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

export interface AgentToolBinding {
  name: string;
  source: "preset" | "agent" | "connector" | "runtime";
  removable: boolean;
  excluded: boolean;
  active: boolean;
}

export interface AgentDetailResponse {
  toolBindings?: AgentToolBinding[];
  modelKey?: string;
  reasoningEffort?: QueryReasoningEffort;
  serviceTier?: QueryServiceTier;
  interactionConfig?: import("@/shared/contracts/interaction").InteractionConfig;
  key: string;
  name: string;
  type?: "agent" | "coder";
  workspaceDir?: string;
  workspaceName?: string;
  icon?: unknown;
  description?: string;
  role?: string;
  greetings?: string[];
  introductions?: string[];
  wonders?: string[];
  mode: string;
  tools: string[];
  skills: Array<{id: string; displayName?: string; name?: string; description?: string; version?: string; revision?: string}>;
  controls: Array<Record<string, unknown>>;
  meta: Record<string, unknown>;
  definition?: Record<string, unknown>;
  soulPrompt?: string;
  agentsPrompt?: string;
  source?: AgentSource;
}

export interface AgentSkill {
  id: string;
  displayName?: string;
  /** Legacy servers only. */
  name?: string;
  revision?: string;
  version?: string;
  icon?: string;
  description?: string;
  configured: boolean;
}

export interface AgentSkillPackage {
  icon?: string;
  id: string;
  name?: string;
  displayName?: string;
  description?: string;
  version?: string;
  /** id is the full package/skill ID, not the member basename. */
  skills: Array<{ id: string; name?: string; displayName?: string; description?: string; version?: string }>;
  missingSkillIds: string[];
  status: "ready" | "incomplete";
}

export interface AgentSkillsResponse {
  packages?: AgentSkillPackage[];
  /** User-level pins, newest first; independent of the selected Agent. */
  pinned: string[];
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
  id: string;
  displayName?: string;
  /** Legacy servers only. */
  name?: string;
  revision?: string;
  version?: string;
  description?: string;
  status: AdminSkillStatus;
  diagnostics?: AdminAgentDiagnostic[];
  enabled: boolean;
  overridesCenter: boolean;
}

export interface CreateAgentRequest {
  key?: string;
  isProject?: boolean;
  definition: Record<string, unknown>;
  soulPrompt?: string;
  agentsPrompt?: string;
}

export type AgentCreationTypeKey = "general" | "coder" | "kbase" | "acp";

/** Client creation type, enriched with profile defaults. */
export interface AgentCreationTypeOption {
  key: AgentCreationTypeKey;
  label: string;
  mode: string;
  engine: string;
  available: boolean;
  unavailableReason?: string;
  workspaceRequired: boolean;
  modelRequired: boolean;
  defaultModelKey?: string;
  defaultModelAvailable: boolean;
  defaultReasoningEffort?: string;
  supportsGroups: boolean;
  groupsUnsupportedReason?: string;
  baseTools: string[];
  defaultGroups: string[];
  acpBridges?: Array<{ id: string }>;
}

export interface AgentCreationMember {
  key: string;
  name: string;
}

export interface AgentCreationGroupOption {
  key: string;
  name: string;
  description?: string;
  skills: AgentCreationMember[];
  tools: string[];
  connectors: AgentCreationMember[];
  available: boolean;
  unavailableReason?: string;
}

export interface AgentCreationDefaultsResponse {
  types: Array<Omit<AgentCreationTypeOption, "supportsGroups" | "groupsUnsupportedReason" | "defaultGroups">>;
  models: Array<{ key: string; name?: string }>;
}

export interface AgentCreationOptionsResponse {
  types: AgentCreationTypeOption[];
  groups: AgentCreationGroupOption[];
  models: Array<{ key: string; name?: string }>;
}

/** GET /api/admin/host/directories: directories on the Agent Platform host. */
export interface HostDirectoryListResponse {
  path: string;
  parent?: string;
  home?: string;
  separator: string;
  entries: Array<{ name: string; path: string }>;
  truncated: boolean;
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
  agentKey: string;
  modelKey?: string;
  reasoningEffort?: QueryReasoningEffort;
  serviceTier?: QueryServiceTier | null;
}

export interface AgentModelConfigResponse {
  agentKey: string;
  modelKey: string;
  reasoningEffort: QueryReasoningEffort;
  serviceTier?: QueryServiceTier;
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
