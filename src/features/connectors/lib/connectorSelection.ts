import type { ConnectorOption } from "@/shared/data";

type ConnectorChoice = Pick<ConnectorOption, "id" | "name" | "description" | "mutuallyExclusiveWith">;

// Composer 内外共用的固定内置清单；只控制展示顺序，不影响挂载与可用性。
const BUILTIN_CONNECTOR_IDS = new Set([
  "builtin.web-control",
  "builtin.platform-control",
  "builtin.kanban-control",
  "builtin.kbase-control",
  "builtin.task-control",
  "builtin.dbx",
  "builtin.httpx",
]);

export function orderConnectorsBuiltinLast<T extends { id: string }>(items: readonly T[]): T[] {
  return [
    ...items.filter(item => !BUILTIN_CONNECTOR_IDS.has(item.id)),
    ...items.filter(item => BUILTIN_CONNECTOR_IDS.has(item.id)),
  ];
}

export interface ConnectorSelectionConflict {
  connectorId: string;
  conflictingConnectorIds: string[];
}

export function connectorOptionStatus(item: ConnectorOption) {
  if (item.availability?.state === "ready") return undefined;
  return item.availability?.reason || "status_unknown";
}

// Either package may declare the relationship; search filters never narrow it.
export function findConnectorSelectionConflict(item: ConnectorChoice, selectedIds: string[], catalog: ConnectorChoice[]): ConnectorSelectionConflict | null {
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

export function connectorSelectionConflictNames(conflict: ConnectorSelectionConflict, catalog: ConnectorChoice[]) {
  const name = (id: string) => catalog.find(item => item.id === id)?.name || id;
  return { name: name(conflict.connectorId), conflicts: conflict.conflictingConnectorIds.map(name).join(", ") };
}

export function filterConnectorOptions<T extends ConnectorChoice>(items: T[], search: string): T[] {
  const needle = search.trim().toLowerCase();
  return items.filter(item => [item.id, item.name, item.description].filter(Boolean).join(" ").toLowerCase().includes(needle));
}
