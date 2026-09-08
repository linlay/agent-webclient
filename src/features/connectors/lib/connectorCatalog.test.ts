import type { AdminToolSummary, ConnectorSummary } from "@/shared/data";
import { connectorFiles, connectorToolDisplayName, connectorsRoutePath, filterConnectorTools, filterConnectors, isConnectorCatalogUpdate, toolsForConnector, unassignedConnectorTools } from "./connectorCatalog";
import { parseConnectorDefinition, updateConnectorField } from "./connectorDefinition";

const mixed: ConnectorSummary = { id: "search", name: "Search", version: "1.0.0", type: "cli", auth_mode: "none", hasMcp: true, hasCli: true, hasBin: true, skills: ["lookup"], mcp: [
  { serverKey: "search", status: "ready", toolCount: 1 },
  { serverKey: "search.extra", status: "unavailable", toolCount: 1 },
] };
const cli: ConnectorSummary = { ...mixed, id: "builtin.dbx", name: "DBX", hasMcp: false, mcp: [] };
const tool = (key: string, serverKey?: string, sourceCategory = "mcp"): AdminToolSummary => ({ key, name: key, serverKey, sourceCategory, kind: "backend", sourceType: "mcp" });

describe("connector catalog and definitions", () => {
  it("filters by included components so hybrid packages appear under both types", () => {
    expect(filterConnectors([mixed, cli], "", "mcp")).toEqual([mixed]);
    expect(filterConnectors([mixed, cli], "", "cli")).toEqual([mixed, cli]);
    expect(filterConnectors([mixed, cli], "LOOKUP", "all")).toHaveLength(2);
    expect(connectorFiles(mixed)).toEqual(["connector.json", "mcp.json", "cli.json"]);
    expect(connectorFiles(cli)).toEqual(["connector.json", "cli.json"]);
  });
  it("assigns all MCP components by exact server key without prefix guessing", () => {
    const tools = [tool("main", "search"), tool("extra", "search.extra"), tool("neighbor", "search.other"), tool("missing"), tool("local", "search", "platform")];
    expect(toolsForConnector(tools, mixed).map(item => item.key)).toEqual(["main", "extra"]);
    expect(unassignedConnectorTools(tools, [mixed, cli]).map(item => item.key)).toEqual(["neighbor", "missing"]);
    expect(toolsForConnector(tools, cli)).toEqual([]);
  });
  it("displays the exact original MCP name and only strips known generated prefixes from older responses", () => {
    const prefixed = tool("mcp_0006cb5d2c648af7_sheet_unset_freeze", "docs");
    const original = "sheet.unset_freeze_with_a_name_longer_than_the_routing_limit";
    expect(connectorToolDisplayName({ ...prefixed, mcpToolName: original })).toBe(original);
    expect(connectorToolDisplayName(prefixed)).toBe("sheet_unset_freeze");
    expect(connectorToolDisplayName({ ...prefixed, label: "取消冻结" })).toBe("取消冻结");
    expect(connectorToolDisplayName({ ...prefixed, mcpToolName: prefixed.name })).toBe(prefixed.name);
    expect(connectorToolDisplayName(tool("mcp_custom_sheet_unset_freeze"))).toBe("mcp_custom_sheet_unset_freeze");
    expect(filterConnectorTools([{ ...prefixed, mcpToolName: original, description: "删除所有冻结行列" }], "SHEET.UNSET")).toHaveLength(1);
    expect(filterConnectorTools([{ ...prefixed, description: "删除所有冻结行列" }], "冻结")).toHaveLength(1);
    expect(prefixed.key).toBe("mcp_0006cb5d2c648af7_sheet_unset_freeze");
  });
  it("uses the new route and update reason", () => {
    expect(connectorsRoutePath("search/a", "lang=zh-CN&theme=dark")).toBe("/connectors/search%2Fa?lang=zh-CN&theme=dark");
    expect(isConnectorCatalogUpdate({ type: "catalog.updated", data: { reason: "connectors" } })).toBe(true);
    expect(isConnectorCatalogUpdate({ type: "catalog.updated", data: { reason: "mcp-servers" } })).toBe(false);
    expect(isConnectorCatalogUpdate(null)).toBe(false);
  });
  it("edits a full HTTP URL without appending a path or losing other components and advanced settings", () => {
    const original = { mcpServers: { main: { type: "streamableHttp", url: "https://old/mcp", headers: { Authorization: "${TOKEN}" }, platform: { aliasMap: { foo: "bar" }, tools: ["foo"] } }, extra: { type: "stdio", command: "service", staticEnv: { LOG_LEVEL: "debug" } } } };
    const updated = parseConnectorDefinition(updateConnectorField(JSON.stringify(original), ["mcpServers", "main", "url"], "https://new/api"));
    expect(updated).toEqual({ mcpServers: { ...original.mcpServers, main: { ...original.mcpServers.main, url: "https://new/api" } } });
  });
  it("rejects malformed JSON and non-object definitions", () => {
    for (const draft of ["{", "[]", "null", "123"]) expect(() => parseConnectorDefinition(draft)).toThrow();
  });
  it("removes a cleared optional timeout without writing a null value", () => {
    const content = '{"mcpServers":{"main":{"type":"stdio","command":"service","timeout":15000}}}';
    expect(parseConnectorDefinition(updateConnectorField(content, ["mcpServers", "main", "timeout"], undefined))).toEqual({ mcpServers: { main: { type: "stdio", command: "service" } } });
  });
});

test("VIEW is a composable component and has its own definition tab", () => {
  const view = { ...mixed, type: "view" as const, hasView: true };
  expect(connectorFiles(view)).toContain("view.json");
});
