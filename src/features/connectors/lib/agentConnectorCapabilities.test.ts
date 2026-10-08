import { agentConnectorCapabilities } from "./agentConnectorCapabilities";
import type { AdminAgentConnectorsResponse, ConnectorSummary, AdminToolSummary } from "@/shared/data";
const selection: AdminAgentConnectorsResponse = { agentKey: "a", presetConnectorIds: ["web"], declaredConnectorIds: ["docs", "missing"], connectorIds: ["web", "docs", "missing"], activeConnectorIds: ["web", "old"], reloadPending: true };
const base: ConnectorSummary = { id: "web", name: "Web", type: "native", version: "1", auth_mode: "no_auth", hasMcp: false, hasCli: false, hasBin: false, skills: [], nativeTools: ["awcp_manual"], tools: [{key:"awcp_manual",name:"awcp_manual",label:"Website manual",description:"Read website instructions",kind:"native",sourceType:"native",sourceCategory:"platform"}] };
const tool = (key: string, serverKey: string): AdminToolSummary => ({ key, name: key, sourceType: "mcp", sourceCategory: "mcp", kind: "mcp", serverKey });
it("keeps preset, declared, pending removals and missing mounts distinct and scoped to the Agent", () => {
 const result = agentConnectorCapabilities(selection, [base, { ...base, id: "docs", nativeTools: [], tools: [tool("read_a", "a_docs"), tool("read_b", "b_docs")], hasMcp: true, mcp: [
  { serverKey: "a_docs", agentKey: "a", toolCount: 1, status: "ready" }, { serverKey: "b_docs", agentKey: "b", toolCount: 1, status: "ready" },
 ] }]);
 expect(result.map(item => item.id)).toEqual(["web", "docs", "missing", "old"]);
 expect(result[0]).toMatchObject({ preset: true, active: true, tools: [{ key: "awcp_manual" }] });
 expect(result[1]).toMatchObject({ preset: false, active: false, tools: [{ key: "read_a" }] });
 expect(result[1].tools).toHaveLength(1);
 expect(result[2]).toMatchObject({ missing: true, active: false });
 expect(result[3]).toMatchObject({ missing: true, active: true });
});
