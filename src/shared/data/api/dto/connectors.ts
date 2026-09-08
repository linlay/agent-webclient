export type ConnectorType = "cli" | "mcp" | "view";
export type ConnectorDefinitionFile = "connector.json" | "mcp.json" | "cli.json" | "view.json";

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
  auth_mode: "none" | "cli" | "mcp" | "token" | "oauth";
  description?: string;
  icon?: string;
  iconSha256?: string;
  iconUrl?: string;
  token_schema?: unknown;
  oauth?: unknown;
  builtin?: boolean;
  readOnly?: boolean;
  canDelete?: boolean;
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

export interface ConnectorSkillSummary {
  name: string;
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

export type ConnectorAuthStatus = "not_required" | "setup_required" | "unauthorized" | "preparing" | "pending" | "authorized" | "failed" | "canceled";

export interface ConnectorAuthSession {
  connectorId: string;
  sessionId: string;
  status: ConnectorAuthStatus;
  authorizationUrl?: string;
  message?: string;
  expiresAt: string;
}

export interface ConnectorAuthActionResult {
  id: string;
  status: "canceled" | "unauthorized";
}
