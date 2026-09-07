export type ConnectorType = "cli" | "mcp";
export type ConnectorDefinitionFile = "connector.json" | "mcp.json" | "cli.json";

export interface ConnectorMcpStatus {
  serverKey: string;
  toolCount: number;
  status: "pending" | "syncing" | "ready" | "unavailable" | "disabled";
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
  token_schema?: unknown;
  oauth?: unknown;
  hasMcp: boolean;
  hasCli: boolean;
  hasBin: boolean;
  skills: string[];
  mcp?: ConnectorMcpStatus[];
}

export interface ConnectorListResponse {
  connectors: ConnectorSummary[];
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
