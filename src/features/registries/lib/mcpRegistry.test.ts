import {
  collectUnassignedMcpTools,
  filterMcpServerItems,
  filterMcpToolsBySearch,
  filterMcpToolsForServer,
  findMcpServerByRouteKey,
  isMcpTool,
  mcpServerKey,
  readToolMcpServerKey,
} from "@/features/registries/lib/mcpRegistry";
import type { AdminRegistryListItem, AdminToolSummary } from "@/shared/data";

const servers: AdminRegistryListItem[] = [
  {
    category: "mcp-servers",
    file: "alpha.yml",
    key: "alpha-fallback",
    name: "Alpha",
    status: "ready",
    summary: { serverKey: "alpha", baseUrl: "http://alpha.example/mcp" },
  },
  {
    category: "mcp-servers",
    file: "beta.yml",
    key: "beta",
    status: "disabled",
    summary: { baseUrl: "http://beta.example/mcp" },
  },
];

const tools: AdminToolSummary[] = [
  {
    key: "alpha_search",
    name: "Alpha Search",
    description: "Search alpha",
    sourceCategory: "mcp",
    sourceType: "mcp",
    serverKey: "alpha",
    kind: "backend",
  },
  {
    key: "beta_read",
    name: "Beta Read",
    sourceCategory: "mcp",
    sourceType: "mcp",
    serverKey: "beta",
    kind: "backend",
  },
  {
    key: "missing_key",
    name: "Missing Key",
    sourceCategory: "mcp",
    sourceType: "mcp",
    kind: "backend",
  },
  {
    key: "orphaned",
    name: "Orphaned",
    sourceCategory: "mcp",
    sourceType: "mcp",
    serverKey: "unknown",
    kind: "backend",
  },
  {
    key: "platform_alpha",
    name: "Platform Alpha",
    sourceCategory: "platform",
    sourceType: "local",
    serverKey: "alpha",
    kind: "backend",
  },
];

describe("MCP registry helpers", () => {
  it("resolves stable connector route keys and direct route matches", () => {
    expect(mcpServerKey(servers[0])).toBe("alpha");
    expect(mcpServerKey(servers[1])).toBe("beta");
    expect(findMcpServerByRouteKey(servers, "alpha")).toBe(servers[0]);
    expect(findMcpServerByRouteKey(servers, "missing")).toBeNull();
  });

  it("attributes only explicit MCP tools with an exact serverKey", () => {
    expect(isMcpTool(tools[0])).toBe(true);
    expect(isMcpTool(tools[4])).toBe(false);
    expect(readToolMcpServerKey(tools[2])).toBe("");
    expect(filterMcpToolsForServer(tools, "alpha").map((tool) => tool.key)).toEqual([
      "alpha_search",
    ]);
    expect(filterMcpToolsForServer(tools, "no-tools")).toHaveLength(0);
  });

  it("separates missing and unknown server keys without including platform tools", () => {
    expect(collectUnassignedMcpTools(tools, servers).map((item) => ({
      key: item.tool.key,
      reason: item.reason,
    }))).toEqual([
      { key: "missing_key", reason: "missing-server-key" },
      { key: "orphaned", reason: "unknown-server-key" },
    ]);
  });

  it("searches connectors and tools across their visible fields", () => {
    expect(filterMcpServerItems(servers, "alpha.example")).toEqual([servers[0]]);
    expect(filterMcpToolsBySearch(tools, "search alpha").map((tool) => tool.key)).toEqual([
      "alpha_search",
    ]);
  });
});
