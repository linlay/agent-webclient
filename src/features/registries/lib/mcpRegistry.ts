import type {
  AdminRegistryListItem,
  AdminToolSummary,
} from "@/shared/data";

export type McpToolAssignmentReason =
  | "missing-server-key"
  | "unknown-server-key";

export interface UnassignedMcpTool {
  tool: AdminToolSummary;
  reason: McpToolAssignmentReason;
}

export function registryText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstRegistryText(...values: unknown[]): string {
  for (const value of values) {
    const text = registryText(value);
    if (text) return text;
  }
  return "";
}

function fileStem(file: string): string {
  return file.replace(/\.ya?ml$/i, "");
}

export function readToolMcpServerKey(tool: AdminToolSummary): string {
  return registryText(tool.serverKey);
}

export function isMcpTool(tool: AdminToolSummary): boolean {
  return registryText(tool.sourceCategory).toLowerCase() === "mcp";
}

export function mcpServerKey(
  item: Pick<
    AdminRegistryListItem,
    "category" | "file" | "key" | "name" | "summary"
  >,
): string {
  if (item.category !== "mcp-servers") return "";
  return firstRegistryText(
    item.summary?.serverKey,
    item.key,
    item.name,
    fileStem(item.file),
  );
}

export function mcpServerItemKey(
  item: Pick<AdminRegistryListItem, "category" | "file">,
): string {
  return `${item.category}/${item.file}`;
}

export function findMcpServerByRouteKey(
  items: AdminRegistryListItem[],
  routeKey: string,
): AdminRegistryListItem | null {
  const target = routeKey.trim();
  if (!target) return null;
  return (
    items.find(
      (item) =>
        item.category === "mcp-servers" && mcpServerKey(item) === target,
    ) || null
  );
}

export function filterMcpToolsForServer(
  tools: AdminToolSummary[],
  serverKey: string,
): AdminToolSummary[] {
  const target = serverKey.trim();
  if (!target) return [];
  return tools.filter(
    (tool) => isMcpTool(tool) && readToolMcpServerKey(tool) === target,
  );
}

export function collectUnassignedMcpTools(
  tools: AdminToolSummary[],
  serverItems: AdminRegistryListItem[],
): UnassignedMcpTool[] {
  const knownServerKeys = new Set(
    serverItems.map(mcpServerKey).filter(Boolean),
  );
  const unassigned: UnassignedMcpTool[] = [];

  for (const tool of tools) {
    if (!isMcpTool(tool)) continue;
    const serverKey = readToolMcpServerKey(tool);
    if (!serverKey) {
      unassigned.push({ tool, reason: "missing-server-key" });
      continue;
    }
    if (!knownServerKeys.has(serverKey)) {
      unassigned.push({ tool, reason: "unknown-server-key" });
    }
  }

  return unassigned;
}

export function filterMcpServerItems(
  items: AdminRegistryListItem[],
  searchText: string,
): AdminRegistryListItem[] {
  const needle = searchText.trim().toLowerCase();
  return items.filter((item) => {
    if (item.category !== "mcp-servers") return false;
    if (!needle) return true;
    const haystack = [
      item.file,
      item.key,
      item.name,
      mcpServerKey(item),
      item.summary?.baseUrl,
      item.diagnostic?.code,
      item.diagnostic?.message,
    ]
      .map(registryText)
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function filterMcpToolsBySearch(
  tools: AdminToolSummary[],
  searchText: string,
): AdminToolSummary[] {
  const needle = searchText.trim().toLowerCase();
  if (!needle) return tools;
  return tools.filter((tool) =>
    [tool.key, tool.name, tool.label, tool.description, tool.kind]
      .map(registryText)
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}
