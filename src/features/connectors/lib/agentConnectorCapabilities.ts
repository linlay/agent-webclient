import type { AdminAgentConnectorBinding, AdminAgentConnectorsResponse, AdminToolSummary, ConnectorSummary } from "@/shared/data";
import { toolsForConnector } from "./connectorCatalog";

export interface AgentConnectorCapability {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  preset: boolean;
  active: boolean;
  pendingRemoval?: boolean;
  missing: boolean;
  connector?: ConnectorSummary;
  tools: AdminToolSummary[];
}

export function agentConnectorCapabilities(selection: AdminAgentConnectorsResponse, catalog: ConnectorSummary[]): AgentConnectorCapability[] {
  const ids = [...new Set([...selection.presetConnectorIds, ...selection.declaredConnectorIds, ...selection.connectorIds, ...selection.activeConnectorIds])];
  return agentConnectorCapabilitiesFromBindings(selection.agentKey, ids.map(id => ({ id,
    source: selection.presetConnectorIds.includes(id) ? "preset" : "agent",
    active: selection.activeConnectorIds.includes(id),
    pendingRemoval: !selection.connectorIds.includes(id),
  })), catalog);
}

export function agentConnectorCapabilitiesFromBindings(agentKey: string, bindings: AdminAgentConnectorBinding[], catalog: ConnectorSummary[]): AgentConnectorCapability[] {
  return bindings.map(({ id, source, active, pendingRemoval }) => {
    const found = catalog.find(item => item.id === id);
    // MCP instances are Agent-specific. Never show another Agent's tools here.
    const connector = found && { ...found, mcp: found.mcp?.filter(server => !server.agentKey || server.agentKey === agentKey) };
    const matched = connector ? toolsForConnector(connector) : [];
    return {
      id, name: connector?.name || id, description: connector?.description, iconUrl: connector?.iconUrl,
      preset: source === "preset", active, pendingRemoval,
      missing: !connector, connector,
      tools: matched,
    };
  });
}
