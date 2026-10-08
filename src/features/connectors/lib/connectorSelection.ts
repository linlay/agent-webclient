import type { ConnectorOption } from "@/shared/data";

export interface ConnectorSelectionConflict {
  connectorId: string;
  conflictingConnectorIds: string[];
}

// Either package may declare the relationship; search filters never narrow it.
export function findConnectorSelectionConflict(item: ConnectorOption, selectedIds: string[], catalog: ConnectorOption[]): ConnectorSelectionConflict | null {
  const conflictingConnectorIds = selectedIds.filter(id => id !== item.id && (
    item.mutuallyExclusiveWith?.includes(id)
    || catalog.find(other => other.id === id)?.mutuallyExclusiveWith?.includes(item.id)
  ));
  return conflictingConnectorIds.length ? { connectorId: item.id, conflictingConnectorIds } : null;
}

export function connectorSelectionConflictFromError(cause: unknown): ConnectorSelectionConflict | null {
  if (!cause || typeof cause !== "object" || !("data" in cause)) return null;
  const data = cause.data;
  if (!data || typeof data !== "object") return null;
  const details = "error" in data ? data.error : data;
  if (!details || typeof details !== "object" || !("code" in details) || details.code !== "connector_selection_conflict") return null;
  // HTTP nests business details in error; WS keeps them beside its error envelope.
  const selection = "connectorId" in details && "conflictingConnectorIds" in details ? details : data;
  if (!("connectorId" in selection) || typeof selection.connectorId !== "string"
    || !("conflictingConnectorIds" in selection) || !Array.isArray(selection.conflictingConnectorIds)
    || !selection.conflictingConnectorIds.length || !selection.conflictingConnectorIds.every(id => typeof id === "string")) return null;
  return { connectorId: selection.connectorId, conflictingConnectorIds: selection.conflictingConnectorIds };
}

export function connectorSelectionConflictNames(conflict: ConnectorSelectionConflict, catalog: ConnectorOption[]) {
  const name = (id: string) => catalog.find(item => item.id === id)?.name || id;
  return { name: name(conflict.connectorId), conflicts: conflict.conflictingConnectorIds.map(name).join(", ") };
}

export function filterConnectorOptions(items: ConnectorOption[], search: string): ConnectorOption[] {
  const needle = search.trim().toLowerCase();
  return items.filter(item => [item.id, item.name, item.description].filter(Boolean).join(" ").toLowerCase().includes(needle));
}
