import { getAdminConnectors, getAdminTools } from "@/shared/data";
import type { AdminToolSummary, ConnectorDefinitionFile, ConnectorSummary, ConnectorType } from "@/shared/data";

export function connectorFiles(item: ConnectorSummary): ConnectorDefinitionFile[] {
  return ["connector.json", ...(item.hasMcp ? ["mcp.json"] : []), ...(item.hasCli ? ["cli.json"] : []), ...(item.hasView ? ["view.json"] : [])] as ConnectorDefinitionFile[];
}

export function filterConnectors(items: ConnectorSummary[], search: string, type: ConnectorType | "all"): ConnectorSummary[] {
  const needle = search.trim().toLowerCase();
  return items.filter(item =>
    (type === "all" || (type === "cli" ? item.hasCli : type === "view" ? item.hasView : item.hasMcp)) &&
    [item.id, item.name, item.description, item.version, ...(item.skills || []), ...(item.mcp || []).map(server => server.serverKey)]
      .filter(Boolean).join(" ").toLowerCase().includes(needle),
  );
}

export function toolsForConnector(tools: AdminToolSummary[], item: ConnectorSummary): AdminToolSummary[] {
  const keys = new Set((item.mcp || []).map(server => server.serverKey));
  return tools.filter(tool => tool.sourceCategory === "mcp" && keys.has(tool.serverKey || ""));
}

export function connectorToolDisplayName(tool: AdminToolSummary): string {
  const name = tool.mcpToolName?.trim() || tool.label?.trim() || tool.name || tool.key;
  // Older admin responses only expose the generated routing name.
  return tool.mcpToolName?.trim() ? name : name.replace(/^mcp_[0-9a-f]{16}_(?=.)/i, "");
}

export function filterConnectorTools(tools: AdminToolSummary[], search: string): AdminToolSummary[] {
  const needle = search.trim().toLowerCase();
  return tools.filter(tool => [connectorToolDisplayName(tool), tool.label, tool.description, tool.key]
    .filter(Boolean).join(" ").toLowerCase().includes(needle));
}

export function unassignedConnectorTools(tools: AdminToolSummary[], items: ConnectorSummary[]): AdminToolSummary[] {
  const keys = new Set(items.flatMap(item => (item.mcp || []).map(server => server.serverKey)));
  return tools.filter(tool => tool.sourceCategory === "mcp" && !keys.has(tool.serverKey || ""));
}

export async function fetchConnectorCatalog() {
  const [catalog, tools] = await Promise.all([getAdminConnectors(), getAdminTools()]);
  return { items: catalog.data.connectors || [], tools: tools.data || [] };
}

export function connectorsRoutePath(id: string, search = ""): string {
  const suffix = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  return `/connectors${id.trim() ? `/${encodeURIComponent(id.trim())}` : ""}${suffix}`;
}

export function isConnectorCatalogUpdate(frame: unknown): boolean {
  const value = frame as { type?: string; data?: { reason?: string } } | null;
  return value?.type === "catalog.updated" && ["connectors", "config"].includes(value.data?.reason || "");
}
