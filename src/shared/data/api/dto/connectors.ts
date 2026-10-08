export type ConnectorType = "cli" | "mcp" | "view" | "native";
export type ConnectorDefinitionFile = "connector.json" | "mcp.json" | "cli.json" | "view.json" | "native.json";

export interface ConnectorMcpStatus {
  serverKey: string;
  toolCount: number;
  status: "pending" | "syncing" | "ready" | "unavailable" | "disabled" | "unmounted";
  agentKey?: string;
  lastSyncAttemptAt?: number;
  lastSyncSuccessAt?: number;
  diagnostic?: { severity: string; code: string; message: string };
}

export interface ConnectorSummary {
  id: string;
  name: string;
  version: string;
  type: ConnectorType;
  auth_browser?: "system" | "embedded";
  auth_mode: "no_auth" | "none" | "cli" | "mcp" | "token" | "oneid-token" | "oauth" | null;
  description?: string;
  icon?: string;
  iconSha256?: string;
  iconUrl?: string;
  token_schema?: unknown;
  oauth?: unknown;
  builtin?: boolean;
  readOnly?: boolean;
  canDelete?: boolean;
  hasNative?: boolean;
  nativeTools?: string[];
  mutuallyExclusiveWith?: string[];
  hasMcp: boolean;
  hasCli: boolean;
  hasView?: boolean;
  views?: Array<{ key: string; title?: string; renderer: string; usage: string[]; source: string }>;
  hasBin: boolean;
  skills: string[];
  mcp?: ConnectorMcpStatus[];
}

export interface ConnectorListResponse {
  connectors: ConnectorSummary[];
}

/** Composer catalog: only fields needed for display, search and selection. */
export interface ConnectorOption {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  mutuallyExclusiveWith?: string[];
}

export interface ConnectorOptionsResponse {
  connectors: ConnectorOption[];
}

/** Public manifest metadata; credential values are never returned by Platform. */
export interface ConnectorTokenField {
  key: string;
  label: string;
  type: "text" | "password";
  required: boolean;
  placeholder?: string;
  description?: string;
  defaultValue?: string;
}
export interface ConnectorTokenSchema {
  fields: ConnectorTokenField[];
  title?: string;
  description?: string;
  docUrl?: string;
  docLabel?: string;
}

export interface ConnectorSkillSummary {
  id?: string;
  displayName?: string;
  /** Legacy servers only. */
  name?: string;
  revision?: string;
  description: string;
  version?: string;
  triggers?: string[];
  path: string;
  size: number;
  updatedAt: number;
}

export interface ConnectorSkillListResponse {
  connectorId: string;
  skills: ConnectorSkillSummary[];
}

export interface ConnectorSkillDetail {
  connectorId: string;
  skill: ConnectorSkillSummary;
  content: string;
  sha256: string;
}

export interface ConnectorDefinitionTarget {
  id: string;
  file: ConnectorDefinitionFile;
}

export interface ConnectorDefinition extends ConnectorDefinitionTarget {
  content: string;
  sha256: string;
}

export interface UpdateConnectorDefinitionRequest extends ConnectorDefinitionTarget {
  content: string;
  baseSha256: string;
}

export interface DeleteConnectorResponse {
  id: string;
  deleted: boolean;
}

export interface ImportConnectorArchiveRequest {
  file: File;
  overwrite?: boolean;
}

export interface ImportConnectorArchiveResponse {
  id: string;
  name: string;
  version: string;
  installed: boolean;
  authMode: ConnectorSummary["auth_mode"];
}

export type ConnectorAuthStatus = "no_auth" | "configured" | "pending_verification" | "not_required" | "delegated" | "setup_required" | "unauthorized" | "preparing" | "pending" | "authorized" | "failed" | "canceled";

export interface ConnectorAuthSession {
  connectorId: string;
  sessionId: string;
  status: ConnectorAuthStatus;
  authorizationUrl?: string;
  authBrowser?: "system" | "embedded";
  message?: string;
  /** Candidate credentials are being checked; existing active credentials may remain usable. */
  pendingVerification?: boolean;
  expiresAt: string;
}

export interface ConnectorAuthActionResult {
  id: string;
  status: "canceled" | "unauthorized";
}
export interface AgentConnectorsResponse {
  agentKey: string;
  connectorIds: string[];
  reloadPending: boolean;
}

export interface AdminAgentConnectorsResponse extends AgentConnectorsResponse {
  presetConnectorIds: string[];
  declaredConnectorIds: string[];
  activeConnectorIds: string[];
}

export interface SetAgentConnectorRequest {
  agentKey: string;
  connectorId: string;
  enabled: boolean;
}

export interface ConnectorOrderResponse {
  version: number;
  /** Pinned connector IDs, newest first; shared across the user's Agents. */
  order: string[];
  updatedAt?: number;
}

export interface UpdateConnectorOrderRequest {
  id: string;
  pinned: boolean;
}

export interface ConnectorConnection {
  connectorId: string;
  configured: boolean;
  configurationRequired: boolean;
  readiness: string;
  authentication: ConnectorAuthSession;
  capabilities: {
    canConnect: boolean;
    canDisconnect: boolean;
    canCheck: boolean;
    authMode: ConnectorSummary["auth_mode"];
    authBrowser: "" | "system" | "embedded";
    hasCli: boolean;
    hasMcp: boolean;
  };
  preparation?: ConnectorPreparation;
}

export interface ConnectorConnectionsResponse {
  connections: ConnectorConnection[];
}

export interface ConnectorPreparation {
  connectorId: string;
  status: "pending" | "preparing" | "ready" | "failed" | "canceled";
  stage?: string;
  message?: string;
}
