// Platform API data only; runtime and authorization belong to Platform.
export interface ACPProject {
  engine: "acp";
  runtimeConfig: {
    engineId: string;
    workspaceRoot: string;
  };
}
export interface ConfigSelection {
  configId: string;
  value: (string) | (boolean);
}



export interface ConfigChoice {
  value: string;
  name: string;
  group?: string;
}
export type ExternalConfigOption = ({
  id: string;
  name: string;
  category?: string;
  type: "select";
  currentValue: string;
  choices: ConfigChoice[];
}) | ({
  id: string;
  name: string;
  category?: string;
  type: "boolean";
  currentValue: boolean;
});
export interface ConfigPreview {
  engineId: string;
  configOptions: ExternalConfigOption[];
}
export interface PreparedSession {
  chatId: string;
  engineId: string;
  preparationId: string;
  configRevision: number;
  configOptions: ExternalConfigOption[];
}
export interface ConfigUpdate {
  chatId: string;
  preparationId: string;
  configRevision: number;
  selections: ConfigSelection[];
}
export interface AuthMethod {
  id: string;
  name: string;
  type: "agent" | "terminal";
  available: boolean;
}
export interface AuthStatus {
  engineId: string;
  state: "unknown" | "required" | "authenticating" | "authenticated" | "error";
  methods: AuthMethod[];
  authOperationId?: string;
}
export interface AuthStart {
  engineId: string;
  methodId: string;
}
export interface EngineError {
  code: 400 | 401 | 403 | 409 | 429 | 502 | 503;
  msg: "invalid_arguments" | "manifest_unsupported" | "invalid_config_selection" | "invalid_permission_option" | "capability_unsupported" | "execute_unsupported_agent" | "elicitation_unsupported" | "management_unauthorized" | "management_forbidden" | "awaiting_forbidden" | "artifact_untrusted" | "management_epoch_mismatch" | "revision_stale" | "revision_conflict" | "registry_not_ready" | "unsupported_deployment" | "dependency_missing" | "engine_unavailable" | "proxy_policy_unsupported" | "auth_required" | "auth_method_unavailable" | "desktop_required" | "interaction_required" | "session_restore_failed" | "session_configuration_stale" | "awaiting_expired" | "submit_conflict" | "artifact_digest_mismatch" | "engine_busy" | "rpc_connection_lost";
  data: {
    errorCode: "invalid_arguments" | "manifest_unsupported" | "invalid_config_selection" | "invalid_permission_option" | "capability_unsupported" | "execute_unsupported_agent" | "elicitation_unsupported" | "management_unauthorized" | "management_forbidden" | "awaiting_forbidden" | "artifact_untrusted" | "management_epoch_mismatch" | "revision_stale" | "revision_conflict" | "registry_not_ready" | "unsupported_deployment" | "dependency_missing" | "engine_unavailable" | "proxy_policy_unsupported" | "auth_required" | "auth_method_unavailable" | "desktop_required" | "interaction_required" | "session_restore_failed" | "session_configuration_stale" | "awaiting_expired" | "submit_conflict" | "artifact_digest_mismatch" | "engine_busy" | "rpc_connection_lost";
    reason?: string;
    executionState: "not_started" | "started" | "unknown";
    retryable: false;
  };
}
export interface EngineCapabilities {
  question: boolean;
  permission: boolean;
  configuration: boolean;
  resume: boolean;
  image: boolean;
  file: boolean;
  planning: boolean;
  access_level: boolean;
  service_tier: boolean;
  steer: boolean;
  boolean_config: boolean;
}
export interface EngineDirectoryEntry {
  engineId: string;
  pluginId: string;
  pluginVersion: string;
  enabled: boolean;
  syncState: "pending" | "applied";
  dependencyState: "unknown" | "missing" | "ready";
  authState: "unknown" | "required" | "authenticating" | "authenticated" | "error";
  runtimeState: "stopped" | "starting" | "ready" | "busy" | "draining" | "failed";
  capabilities: EngineCapabilities;
}
export interface EngineDirectory {
  apiVersion: 1;
  catalogGeneration: string;
  revision: number;
  ready: boolean;
  engines: EngineDirectoryEntry[];
}
export interface DirectoryChanged {
  catalogGeneration: string;
  revision: number;
}
export type EpochMillis = number;
export interface SessionPrepare {
  agentKey?: string;
  chatId: string;
}
export interface AuthCancel {
  authOperationId: string;
}
