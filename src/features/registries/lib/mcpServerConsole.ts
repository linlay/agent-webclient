import {
  getAdminRegistries,
  getAdminTools,
  type AdminRegistryDetailResponse,
  type AdminRegistryListItem,
  type AdminRegistryStatus,
  type AdminSourceResponse,
  type AdminToolSummary,
} from "@/shared/data";
import {
  mcpServerKey,
  registryText,
} from "@/features/registries/lib/mcpRegistry";

export const MCP_CATALOG_POLL_INTERVAL_MS = 5_000;
export const MCP_CATALOG_PUSH_DEBOUNCE_MS = 150;

export type McpServerEditorMode = "structured" | "source";

export type McpToolSyncStatus =
  | "pending"
  | "syncing"
  | "ready"
  | "unavailable"
  | "disabled";

const MCP_TOOL_SYNC_STATUSES = new Set<McpToolSyncStatus>([
  "pending",
  "syncing",
  "ready",
  "unavailable",
  "disabled",
]);

export interface McpCatalogSnapshot {
  items: AdminRegistryListItem[];
  tools: AdminToolSummary[];
}

export interface McpDetailLoadResult {
  detail: AdminRegistryDetailResponse;
  item: AdminRegistryListItem;
  validationError: string;
}

export function summaryNumber(
  summary: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = summary?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function summaryLine(summary: Record<string, unknown> | undefined): string {
  if (!summary) return "";
  return Object.entries(summary)
    .filter(
      ([key, value]) =>
        ![
          "syncStatus",
          "lastSyncAttemptAt",
          "lastSyncSuccessAt",
          "syncDiagnostic",
        ].includes(key) &&
        value !== undefined &&
        value !== null &&
        (Array.isArray(value) || typeof value !== "object") &&
        String(value).trim(),
    )
    .slice(0, 5)
    .map(
      ([key, value]) =>
        `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`,
    )
    .join(" · ");
}

export function mergeMcpValidationSummary(
  current: Record<string, unknown> | undefined,
  validated: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const next = { ...(validated || {}) };
  for (const key of [
    "toolCount",
    "syncStatus",
    "lastSyncAttemptAt",
    "lastSyncSuccessAt",
    "syncDiagnostic",
  ]) {
    if (current && Object.prototype.hasOwnProperty.call(current, key)) {
      next[key] = current[key];
    }
  }
  return next;
}

export function readMcpToolSyncStatus(
  summary: Record<string, unknown> | undefined,
): McpToolSyncStatus {
  const status = registryText(summary?.syncStatus) as McpToolSyncStatus;
  if (MCP_TOOL_SYNC_STATUSES.has(status)) return status;
  return summaryNumber(summary, "toolCount") === undefined ? "pending" : "ready";
}

export function readMcpSyncDiagnostic(
  summary: Record<string, unknown> | undefined,
): { severity: string; code: string; message: string } | null {
  const value = summary?.syncDiagnostic;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const diagnostic = value as Record<string, unknown>;
  const message = registryText(diagnostic.message);
  if (!message) return null;
  return {
    severity: registryText(diagnostic.severity) || "error",
    code: registryText(diagnostic.code) || "mcp_sync_failed",
    message,
  };
}

export function statusTone(
  status: AdminRegistryStatus,
): "accent" | "danger" | "muted" {
  if (status === "invalid") return "danger";
  if (status === "disabled") return "muted";
  return "accent";
}

export function syncStatusTone(
  status: McpToolSyncStatus,
): "accent" | "danger" | "muted" {
  if (status === "ready") return "accent";
  if (status === "unavailable") return "danger";
  return "muted";
}

export type McpServerDisplayStatus =
  | { kind: "registry"; status: AdminRegistryStatus }
  | { kind: "sync"; status: McpToolSyncStatus };

export function resolveMcpServerDisplayStatus(
  registryStatus: AdminRegistryStatus,
  syncStatus: McpToolSyncStatus,
): McpServerDisplayStatus {
  return registryStatus === "ready"
    ? { kind: "sync", status: syncStatus }
    : { kind: "registry", status: registryStatus };
}

export function catalogUpdateReason(frame: unknown): string {
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) return "";
  const record = frame as Record<string, unknown>;
  if (registryText(record.type) !== "catalog.updated") return "";
  const data =
    record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : {};
  return registryText(data.reason);
}

export async function fetchMcpCatalogSnapshot(): Promise<McpCatalogSnapshot> {
  const [registryResponse, toolsResponse] = await Promise.all([
    getAdminRegistries(),
    getAdminTools(),
  ]);
  return {
    items: (registryResponse.data.items || []).filter(
      (item) => item.category === "mcp-servers",
    ),
    tools: Array.isArray(toolsResponse.data) ? toolsResponse.data : [],
  };
}

export function mcpServerCardTitle(item: AdminRegistryListItem): string {
  return registryText(item.name) || registryText(item.key) || mcpServerKey(item);
}

export function mcpServerCardSecondaryKey(item: AdminRegistryListItem): string {
  const title = mcpServerCardTitle(item);
  const serverKey = mcpServerKey(item);
  return title === serverKey ? "" : serverKey;
}

export function defaultMcpServerFileName(items: AdminRegistryListItem[]): string {
  const names = new Set(
    items
      .filter((item) => item.category === "mcp-servers")
      .map((item) => item.file),
  );
  let index = 1;
  while (true) {
    const file =
      index === 1 ? "new-mcp-server.yml" : `new-mcp-server-${index}.yml`;
    if (!names.has(file)) return file;
    index += 1;
  }
}

export function createMcpServerTemplate(file: string): string {
  const key = file.replace(/\.ya?ml$/i, "");
  return [
    `serverKey: ${key}`,
    "baseUrl: http://localhost:11969",
    'endpointPath: "/mcp"',
    "enabled: true",
    "toolPrefix: ",
    "read-timeout: 15",
    "",
  ].join("\n");
}

export function isMcpServerSaveDisabled({
  hasDetail,
  detailLoading,
  saving,
  validating,
}: {
  hasDetail: boolean;
  detailLoading: boolean;
  saving: boolean;
  validating: boolean;
}): boolean {
  return !hasDetail || detailLoading || saving || validating;
}

export function shouldLoadMcpServerDirectly({
  currentRouteKey,
  dirty,
  newDraft,
  selectedItemKey,
  targetItemKey,
  targetRouteKey,
}: {
  currentRouteKey: string;
  dirty: boolean;
  newDraft: boolean;
  selectedItemKey: string;
  targetItemKey: string;
  targetRouteKey: string;
}): boolean {
  return (
    dirty ||
    newDraft ||
    selectedItemKey === targetItemKey ||
    currentRouteKey === targetRouteKey
  );
}

export function selectMcpServerAfterDelete(
  previousItems: AdminRegistryListItem[],
  remainingItems: AdminRegistryListItem[],
  deletedFile: string,
): AdminRegistryListItem | null {
  if (remainingItems.length === 0) return null;
  const deletedIndex = previousItems.findIndex(
    (item) => item.file === deletedFile,
  );
  if (deletedIndex < 0) return remainingItems[0];
  return (
    remainingItems[Math.min(deletedIndex, remainingItems.length - 1)] ||
    remainingItems[0]
  );
}

export function mcpDetailToListItem(
  detail: AdminRegistryDetailResponse,
): AdminRegistryListItem {
  const firstDiagnostic = detail.diagnostics?.[0];
  return {
    category: detail.category,
    file: detail.file,
    key: detail.key,
    name: detail.name,
    status: detail.status,
    summary: detail.summary,
    diagnostic: firstDiagnostic
      ? {
          severity: firstDiagnostic.severity,
          code: firstDiagnostic.code,
          message: firstDiagnostic.message,
        }
      : undefined,
    diagnosticCount: detail.diagnostics?.length || undefined,
    updatedAt: detail.updatedAt,
  };
}

export function mcpDetailFromSource(
  source: AdminSourceResponse,
  fallback: Partial<AdminRegistryDetailResponse> = {},
): AdminRegistryDetailResponse {
  return {
    category: "mcp-servers",
    file: source.target.file || "",
    key: fallback.key,
    name: fallback.name,
    status: fallback.status || "ready",
    summary: fallback.summary || {},
    diagnostics: fallback.diagnostics,
    source: source.source,
    content: source.content,
    encoding: source.encoding,
    sha256: source.sha256,
    updatedAt: source.updatedAt,
    size: source.size,
  };
}
