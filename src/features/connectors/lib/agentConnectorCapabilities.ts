import type { AdminAgentConnectorsResponse, AdminToolSummary, ConnectorSummary } from "@/shared/data";
import { toolsForConnector } from "./connectorCatalog";

export interface AgentConnectorCapability {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  preset: boolean;
  active: boolean;
  missing: boolean;
  connector?: ConnectorSummary;
  tools: AdminToolSummary[];
}

export function agentConnectorCapabilities(selection: AdminAgentConnectorsResponse, catalog: ConnectorSummary[]): AgentConnectorCapability[] {
  const ids = [...new Set([...selection.presetConnectorIds, ...selection.declaredConnectorIds, ...selection.connectorIds, ...selection.activeConnectorIds])];
  return ids.map(id => {
    const found = catalog.find(item => item.id === id);
    // MCP instances are Agent-specific. Never show another Agent's tools here.
    const connector = found && { ...found, mcp: found.mcp?.filter(server => !server.agentKey || server.agentKey === selection.agentKey) };
    const matched = connector ? toolsForConnector(connector) : [];
    return {
      id, name: connector?.name || id, description: connector?.description, iconUrl: connector?.iconUrl,
      preset: selection.presetConnectorIds.includes(id), active: selection.activeConnectorIds.includes(id),
      missing: !connector, connector,
      tools: matched,
    };
  });
}
