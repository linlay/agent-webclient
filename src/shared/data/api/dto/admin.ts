export interface AgentSource {
  kind: string;
  path?: string;
  agentDir?: string;
}

export type AdminRegistryCategory =
  | "providers"
  | "models"
  | "viewport-servers";

export type RegistryConsoleTab = Exclude<AdminRegistryCategory, "viewport-servers"> | "tools";

export type AdminRegistryStatus = "ready" | "invalid" | "disabled";

export type AdminToolSourceCategory = "platform" | "external" | "mcp" | (string & {});

export interface AdminToolSummary {
  key: string;
  name: string;
  label?: string;
  description?: string;
  kind: string;
  sourceType: string;
  sourceCategory: AdminToolSourceCategory;
  serverKey?: string;
  mcpToolName?: string;
}

export interface AdminRegistryDiagnostic {
  severity: string;
  code: string;
  message: string;
  sourcePath?: string;
}

export interface AdminRegistryListDiagnostic {
  severity: string;
  code: string;
  message: string;
}

interface AdminRegistryBase {
  category: AdminRegistryCategory;
  file: string;
  key?: string;
  name?: string;
  status: AdminRegistryStatus;
  summary?: Record<string, unknown>;
  updatedAt?: number;
}

export interface AdminRegistryListItem extends AdminRegistryBase {
  diagnostic?: AdminRegistryListDiagnostic;
  diagnosticCount?: number;
}

export interface AdminRegistrySummary extends AdminRegistryBase {
  diagnostics?: AdminRegistryDiagnostic[];
  source?: AgentSource;
  size?: number;
}

export interface AdminRegistryListResponse {
  items: AdminRegistryListItem[];
  total: number;
}

export interface AdminRegistryDetailResponse extends AdminRegistrySummary {
  content: string;
  parsed?: Record<string, unknown>;
  encoding?: string;
  sha256?: string;
}

export interface AdminRegistryValidateRequest {
  category: AdminRegistryCategory;
  file?: string;
  content: string;
}

export interface AdminRegistryValidateResponse {
  status: AdminRegistryStatus;
  diagnostics?: AdminRegistryDiagnostic[];
  summary?: Record<string, unknown>;
  parsed?: Record<string, unknown>;
}

export type AdminSourceType = "agent" | "skill" | "automation" | "registry";

export type AdminSourceTarget =
  | {
      type: "agent" | "automation";
      key: string;
      path?: never;
      category?: never;
      file?: never;
    }
  | {
      type: "skill";
      key: string;
      path: string;
      category?: never;
      file?: never;
    }
  | {
      type: "registry";
      key?: never;
      path?: never;
      category: AdminRegistryCategory;
      file: string;
    };

export interface AdminSourceResponse {
  target: AdminSourceTarget;
  source: AgentSource;
  content: string;
  encoding: "utf-8" | string;
  sha256: string;
  size: number;
  updatedAt?: number;
}

export interface UpdateAdminSourceRequest {
  target: AdminSourceTarget;
  content: string;
  baseSha256?: string;
}

export interface DeleteAdminSourceRequest {
  target: AdminSourceTarget;
  baseSha256?: string;
}

export interface DeleteAdminSourceResponse {
  target: AdminSourceTarget;
  deleted: boolean;
}
