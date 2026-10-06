import type { AdminAgentConnectorsResponse, ConnectorConnection, ConnectorSummary } from "@/shared/data";
import { connectorChatUrl, prepareConnectorChat, type ConnectorChatDependencies } from "./connectorChat";
const item: ConnectorSummary = { id: "installed-id", name: "Installed", version: "1", type: "cli", auth_mode: null, hasCli: true, hasMcp: false, hasBin: false, skills: [] };
const connection = (changes: Partial<ConnectorConnection> = {}): ConnectorConnection => ({ connectorId: item.id, configured: true, configurationRequired: true, readiness: "ready", authentication: { connectorId: item.id, sessionId: "", status: "authorized", expiresAt: "" }, capabilities: { canConnect: true, canDisconnect: true, canCheck: true, authMode: null, authBrowser: "system", hasCli: true, hasMcp: false }, preparation: { connectorId: item.id, status: "ready" }, ...changes });
const state = (changes: Partial<AdminAgentConnectorsResponse> = {}): AdminAgentConnectorsResponse => ({ agentKey: "default", connectorIds: [], activeConnectorIds: [], presetConnectorIds: [], declaredConnectorIds: [], reloadPending: false, ...changes });
let now: number;
let deps: ConnectorChatDependencies;
beforeEach(() => {
  now = 0;
  deps = { readConnection: jest.fn().mockResolvedValue(connection()), prepare: jest.fn().mockResolvedValue({ connectorId: item.id, status: "preparing" }), readAgent: jest.fn().mockResolvedValue(state()), mount: jest.fn().mockResolvedValue(state({ connectorIds: [item.id], activeConnectorIds: [item.id] })), wait: jest.fn().mockImplementation(async () => { now += 2_000; }), now: () => now, assertCurrent: jest.fn(), onPhase: jest.fn() };
});
it("prepares independently, then waits for runtime activation after saving the mount", async () => {
  jest.mocked(deps.readConnection).mockResolvedValueOnce(connection({ readiness: "preparing", preparation: { connectorId: item.id, status: "pending" } })).mockResolvedValueOnce(connection({ readiness: "preparing", preparation: { connectorId: item.id, status: "preparing" } }));
  jest.mocked(deps.mount).mockResolvedValueOnce(state({ connectorIds: [item.id], reloadPending: true }));
  jest.mocked(deps.readAgent).mockResolvedValueOnce(state()).mockResolvedValueOnce(state({ connectorIds: [item.id], activeConnectorIds: [item.id] }));
  await prepareConnectorChat(item, "default", deps);
  expect(deps.prepare).toHaveBeenCalledTimes(1);
  expect(deps.mount).toHaveBeenCalledTimes(1);
  expect(deps.wait).toHaveBeenCalledTimes(2);
  expect(jest.mocked(deps.prepare).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(deps.mount).mock.invocationCallOrder[0]);
});
it("uses fresh CLI capabilities even when a stale catalog says no CLI", async () => {
  jest.mocked(deps.readConnection).mockResolvedValueOnce(connection({ readiness: "preparing", preparation: undefined })).mockResolvedValueOnce(connection());
  await prepareConnectorChat({ ...item, hasCli: false }, "default", deps);
  expect(deps.prepare).toHaveBeenCalledTimes(1);
  expect(jest.mocked(deps.prepare).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(deps.mount).mock.invocationCallOrder[0]);
});
it("rejects failed preparation from fresh CLI capabilities instead of mounting from stale metadata", async () => {
  jest.mocked(deps.readConnection).mockResolvedValue(connection({ readiness: "preparing", preparation: { connectorId: item.id, status: "failed" } }));
  await expect(prepareConnectorChat({ ...item, hasCli: false }, "default", deps)).rejects.toMatchObject({ reason: "preparationFailed" });
  expect(deps.mount).not.toHaveBeenCalled();
});
it.each([
  ["configurationRequired", connection({ configured: false, readiness: "configuration_required" })],
  ["authorizationRequired", connection({ readiness: "authorization_required", authentication: { connectorId: item.id, sessionId: "", status: "unauthorized", expiresAt: "" } })],
  ["authorizationRequired", connection({ readiness: "pending_verification", authentication: { connectorId: item.id, sessionId: "", status: "pending_verification", expiresAt: "", pendingVerification: true } })],
  ["invalidResponse", connection({ connectorId: "market-id" })],
])("blocks %s before changing the Agent", async (reason, snapshot) => {
  jest.mocked(deps.readConnection).mockResolvedValue(snapshot as ConnectorConnection);
  await expect(prepareConnectorChat(item, "default", deps)).rejects.toMatchObject({ reason });
  expect(deps.mount).not.toHaveBeenCalled();
});
it("allows existing valid credentials while a new candidate is pending", async () => {
  jest.mocked(deps.readConnection).mockResolvedValue(connection({ authentication: { connectorId: item.id, sessionId: "", status: "authorized", expiresAt: "", pendingVerification: true } }));
  await prepareConnectorChat(item, "default", deps);
  expect(deps.mount).toHaveBeenCalledTimes(1);
});
it("reads an unknown mount result once without replaying the mutation", async () => {
  jest.mocked(deps.mount).mockRejectedValueOnce(new Error("connection lost"));
  jest.mocked(deps.readAgent).mockResolvedValueOnce(state()).mockResolvedValueOnce(state({ connectorIds: [item.id], activeConnectorIds: [item.id] }));
  await prepareConnectorChat(item, "default", deps);
  expect(deps.mount).toHaveBeenCalledTimes(1);
  expect(deps.readAgent).toHaveBeenCalledTimes(2);
});
it("does not remount an already active connector and allows no_auth without configured state", async () => {
  jest.mocked(deps.readConnection).mockResolvedValue(connection({ configured: false, configurationRequired: false, readiness: "no_auth", authentication: { connectorId: item.id, sessionId: "", status: "no_auth", expiresAt: "" }, capabilities: { ...connection().capabilities, authMode: "no_auth" }, preparation: undefined }));
  jest.mocked(deps.readAgent).mockResolvedValue(state({ connectorIds: [item.id], activeConnectorIds: [item.id] }));
  await prepareConnectorChat({ ...item, builtin: true, auth_mode: "no_auth" }, "default", deps);
  expect(deps.prepare).not.toHaveBeenCalled(); expect(deps.mount).not.toHaveBeenCalled();
});
it.each(["failed", "unauthorized"] as const)("rejects inconsistent no_auth plus %s without mounting", async status => {
  jest.mocked(deps.readConnection).mockResolvedValue(connection({ configured: false, configurationRequired: false, readiness: "no_auth", authentication: { connectorId: item.id, sessionId: "", status, expiresAt: "" }, capabilities: { ...connection().capabilities, authMode: "no_auth" }, preparation: undefined }));
  await expect(prepareConnectorChat({ ...item, builtin: true, hasCli: false, auth_mode: "no_auth" }, "default", deps)).rejects.toMatchObject({ reason: "invalidResponse" });
  expect(deps.mount).not.toHaveBeenCalled();
});
it("bounds preparation and deferred runtime publication without retrying writes", async () => {
  jest.mocked(deps.readConnection).mockResolvedValue(connection({ readiness: "preparing", preparation: { connectorId: item.id, status: "preparing" } }));
  await expect(prepareConnectorChat(item, "default", deps)).rejects.toMatchObject({ reason: "preparationTimeout" });
  expect(deps.mount).not.toHaveBeenCalled(); expect(deps.prepare).not.toHaveBeenCalled();
  now = 0; jest.mocked(deps.readConnection).mockResolvedValue(connection());
  jest.mocked(deps.readAgent).mockResolvedValue(state({ connectorIds: [item.id], reloadPending: true }));
  await expect(prepareConnectorChat(item, "default", deps)).rejects.toMatchObject({ reason: "reloadTimeout" });
  expect(deps.mount).not.toHaveBeenCalled();
});
it("stops a stale or canceled scope before side effects", async () => {
  jest.mocked(deps.assertCurrent).mockImplementation(() => { throw new Error("scope changed"); });
  await expect(prepareConnectorChat(item, "default", deps)).rejects.toThrow("scope changed");
  expect(deps.prepare).not.toHaveBeenCalled(); expect(deps.mount).not.toHaveBeenCalled();
});
it("generates a one-shot pure draft, including an explicit empty draft, without an admin skill", () => {
  const empty = new URL(connectorChatUrl("default", "", 1_790_000_000_000), "https://example.test");
  expect(empty.searchParams.has("composerDraft")).toBe(true);
  expect(empty.searchParams.get("composerDraft")).toBe("");
  expect(empty.searchParams.has("composerSkill")).toBe(false);
  const example = new URL(connectorChatUrl("default", "Synthetic connector example", 1_790_000_000_000), "https://example.test");
  expect(example.searchParams.get("composerDraft")).toBe("Synthetic connector example");
  expect(Number(example.searchParams.get("newChat"))).toBeGreaterThan(Number(empty.searchParams.get("newChat")));
});
