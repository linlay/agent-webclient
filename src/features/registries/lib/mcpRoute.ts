export function mcpServersRoutePath(serverKey: string, search = ""): string {
  const normalizedKey = serverKey.trim();
  const normalizedSearch = search
    ? search.startsWith("?") ? search : `?${search}`
    : "";
  return normalizedKey
    ? `/mcp-servers/${encodeURIComponent(normalizedKey)}${normalizedSearch}`
    : `/mcp-servers${normalizedSearch}`;
}
