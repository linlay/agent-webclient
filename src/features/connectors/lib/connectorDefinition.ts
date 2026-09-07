export function parseConnectorDefinition(content: string): Record<string, unknown> {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSON must be an object");
  }
  return value as Record<string, unknown>;
}

export function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

// Change only the selected field; component siblings and deployment-specific fields survive.
export function updateConnectorField(content: string, path: string[], value: unknown): string {
  const root = parseConnectorDefinition(content);
  let node = root;
  for (const key of path.slice(0, -1)) {
    const child = { ...jsonRecord(node[key]) };
    Object.defineProperty(node, key, { value: child, enumerable: true, writable: true, configurable: true });
    node = child;
  }
  Object.defineProperty(node, path[path.length - 1], { value, enumerable: true, writable: true, configurable: true });
  return `${JSON.stringify(root, null, 2)}\n`;
}
