/** @jest-environment jsdom */
import { deleteConnector, cancelConnectorAuth, getAdminConnectors, getConnectorSkills, getConnectorSkillDetail, getConnectorAuthStatus, getConnectorDefinition, importConnectorArchive, logoutConnectorAuth, startConnectorAuth, updateConnectorDefinition } from "./connectors";
import { ApiError, requestJson, setAccessToken } from "@/shared/data/api/http";
import { getConnectors, getAgentConnectors, setAgentConnector, getAdminAgentConnectors, setAdminAgentConnector } from "./connectors";
import { getConnectorConnections, prepareConnector, saveConnectorCredentials } from "./connectors";
jest.mock("@/shared/data/api/http", () => ({
  ...jest.requireActual("@/shared/data/api/http"),
  requestJson: jest.fn(),
}));
beforeEach(() => jest.clearAllMocks());

it("reads deployment connection snapshots through the uncached public endpoint", async () => {
  const controller = new AbortController();
  await getConnectorConnections(controller.signal);
  expect(requestJson).toHaveBeenCalledWith("/api/connectors/connection", { method: "GET", cache: "no-store", signal: controller.signal });
});

it("sends private credentials and explicit preparation through uncached HTTP without mutation replay", async () => {
  const controller = new AbortController();
  await saveConnectorCredentials("installed-id", { API_KEY: "synthetic-test-token" }, controller.signal);
  await prepareConnector("installed-id", controller.signal);
  expect(requestJson).toHaveBeenNthCalledWith(1, "/api/admin/connectors/auth?id=installed-id", { method: "PUT", body: JSON.stringify({ credentials: { API_KEY: "synthetic-test-token" } }), cache: "no-store", signal: controller.signal, retryUnauthorized: false });
  expect(requestJson).toHaveBeenNthCalledWith(2, "/api/admin/connectors/prepare?id=installed-id", { method: "POST", cache: "no-store", signal: controller.signal, retryUnauthorized: false });
});

it("reads configured Agent connectors without caching and sends only the single switch edit", async () => {
  await getAgentConnectors("zenmi & other");
  const input = { agentKey: "zenmi", connectorId: "docs", enabled: false };
  await setAgentConnector(input);
  expect(requestJson).toHaveBeenNthCalledWith(1, "/api/agents/connectors?agentKey=zenmi+%26+other", { cache: "no-store" });
  expect(requestJson).toHaveBeenNthCalledWith(2, "/api/agents/connectors", { method: "PUT", cache: "no-store", body: JSON.stringify(input) });
});

it("uses installed connector APIs with file identity and a required base hash", async () => {
  await getAdminConnectors();
  await getConnectorDefinition({ id: "builtin.dbx", file: "cli.json" });
  const input = { id: "builtin.dbx", file: "cli.json" as const, content: '{"versionCheck":"dbx --version"}', baseSha256: "original-sha" };
  await updateConnectorDefinition(input);
  expect(requestJson).toHaveBeenNthCalledWith(1, "/api/admin/connectors");
  expect(requestJson).toHaveBeenNthCalledWith(2, "/api/admin/connectors/detail?id=builtin.dbx&file=cli.json");
  expect(requestJson).toHaveBeenNthCalledWith(3, "/api/admin/connectors/detail", { method: "PUT", body: JSON.stringify(input) });
});

it("loads the minimal usage catalog with an encoded Agent scope and forwards cancellation", async () => {
  const controller = new AbortController();
  await getConnectors("zenmi & other", controller.signal);
  await getConnectors();
  expect(requestJson).toHaveBeenNthCalledWith(1, "/api/connectors?agentKey=zenmi+%26+other", { cache: "no-store", signal: controller.signal });
  expect(requestJson).toHaveBeenNthCalledWith(2, "/api/connectors", { cache: "no-store" });
});

it("keeps complete Agent mount reads and writes on independent management endpoints", async () => {
  const controller = new AbortController();
  const input = { agentKey: "zenmi", connectorId: "docs", enabled: true };
  await getAdminAgentConnectors("zenmi & other", controller.signal);
  await setAdminAgentConnector(input, controller.signal);
  expect(requestJson).toHaveBeenNthCalledWith(1, "/api/admin/agents/connectors?agentKey=zenmi+%26+other", { cache: "no-store", signal: controller.signal });
  expect(requestJson).toHaveBeenNthCalledWith(2, "/api/admin/agents/connectors", { method: "PUT", body: JSON.stringify(input), cache: "no-store", signal: controller.signal });
});

it("uploads exactly one ZIP without forcing a JSON content type and only adds overwrite when requested", async () => {
  jest.mocked(requestJson).mockClear();
  const file = new File(["zip fixture"], "connector.zip", { type: "application/zip" });
  await importConnectorArchive({ file });
  await importConnectorArchive({ file, overwrite: true });
  const calls = jest.mocked(requestJson).mock.calls;
  expect(calls[0][0]).toBe("/api/admin/connectors/import");
  expect(calls[0][1]).toMatchObject({ method: "POST", jsonContentType: false });
  const first = calls[0][1]?.body as FormData;
  const second = calls[1][1]?.body as FormData;
  expect(first.getAll("file")).toEqual([file]);
  expect(first.has("overwrite")).toBe(false);
  expect(second.getAll("file")).toEqual([file]);
  expect(second.get("overwrite")).toBe("true");
});

it("uses all four authenticated authorization endpoints without caching and forwards cancellation", async () => {
  const controller = new AbortController();
  await getConnectorAuthStatus("demo & other", controller.signal);
  await startConnectorAuth("demo", controller.signal);
  await cancelConnectorAuth("demo", controller.signal);
  await logoutConnectorAuth("demo", controller.signal);
  expect(jest.mocked(requestJson).mock.calls).toEqual([
    ["/api/admin/connectors/auth?id=demo+%26+other", { method: "GET", cache: "no-store", signal: controller.signal }],
    ["/api/admin/connectors/auth?id=demo", { method: "POST", cache: "no-store", signal: controller.signal }],
    ["/api/admin/connectors/auth/cancel?id=demo", { method: "POST", cache: "no-store", signal: controller.signal }],
    ["/api/admin/connectors/auth?id=demo", { method: "DELETE", cache: "no-store", signal: controller.signal }],
  ]);
});

it("consumes the Platform envelope through the existing identity client and preserves HTTP errors", async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();
  globalThis.fetch = fetchMock;
  const actualRequest = jest.requireActual("@/shared/data/api/http").requestJson;
  const data = { connectorId: "demo", sessionId: "", status: "unauthorized", expiresAt: "0001-01-01T00:00:00Z" };
  setAccessToken("platform-test-identity");
  try {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ code: 0, msg: "", data }) });
    jest.mocked(requestJson).mockImplementationOnce(actualRequest);
    await expect(getConnectorAuthStatus("demo")).resolves.toMatchObject({ code: 0, data });
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/connectors/auth?id=demo", expect.objectContaining({ cache: "no-store", credentials: "same-origin", headers: expect.objectContaining({ Authorization: "Bearer platform-test-identity" }) }));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: async () => '{"error":"unauthorized"}' });
    jest.mocked(requestJson).mockImplementationOnce(actualRequest);
    await expect(startConnectorAuth("demo")).rejects.toMatchObject({ name: "ApiError", status: 401 });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => "<html>old server</html>" });
    jest.mocked(requestJson).mockImplementationOnce(actualRequest);
    await expect(getConnectorAuthStatus("demo")).rejects.toBeInstanceOf(ApiError);
  } finally {
    globalThis.fetch = originalFetch;
    setAccessToken("");
  }
});


it("scopes connector skill queries to the admin connector and original skill name", async () => {
  await getConnectorSkills("builtin.dbx");
  await getConnectorSkillDetail("builtin.dbx", "query&report");
  expect(requestJson).toHaveBeenNthCalledWith(1, "/api/admin/connectors/skills?id=builtin.dbx");
  expect(requestJson).toHaveBeenNthCalledWith(2, "/api/admin/connectors/skills/detail?id=builtin.dbx&skillId=query%26report");
});


it("deletes the installed package through the detail endpoint with an encoded id", async () => {
  await deleteConnector("demo & other");
  expect(requestJson).toHaveBeenCalledWith("/api/admin/connectors/detail?id=demo+%26+other", { method: "DELETE", cache: "no-store" });
});


it.each([false, true])("preserves delete conflict reasons and references through HTTP (structured=%s)", async structured => {
  const originalFetch = globalThis.fetch;
  const reason = "connector is still used by agents: worker";
  const details = { agentKeys: ["worker"], ...(structured ? { code: "connector_in_use", message: reason, status: 409 } : {}) };
  globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 409, text: async () => JSON.stringify({ code: 409, msg: reason, data: { error: details } }) });
  jest.mocked(requestJson).mockImplementationOnce(jest.requireActual("@/shared/data/api/http").requestJson);
  try {
    await expect(deleteConnector("demo")).rejects.toMatchObject({
      status: 409, data: { error: details }, platformError: { message: reason, ...(structured ? { code: "connector_in_use" } : {}) },
    });
  } finally { globalThis.fetch = originalFetch; }
});

it("keeps a busy conflict distinct from an Agent binding conflict", async () => {
  const originalFetch = globalThis.fetch;
  const reason = "connector preparation or mutation is in progress";
  globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 409, text: async () => JSON.stringify({ code: 409, msg: reason, data: { error: { code: "connector_busy", message: reason, status: 409 } } }) });
  jest.mocked(requestJson).mockImplementationOnce(jest.requireActual("@/shared/data/api/http").requestJson);
  try {
    await expect(deleteConnector("demo")).rejects.toMatchObject({ code: "connector_busy", platformError: { code: "connector_busy", message: reason } });
  } finally { globalThis.fetch = originalFetch; }
});


it.each([400, 200])("preserves connector selection errors for status %s", async status => {
  const originalFetch = globalThis.fetch;
  const reason = "所选连接器互斥，请先取消已选择的冲突连接器";
  const details = { code: "connector_selection_conflict", message: reason, status: 400, connectorId: "custom-second", conflictingConnectorIds: ["custom-first"] };
  globalThis.fetch = jest.fn().mockResolvedValue({ ok: status === 200, status, text: async () => JSON.stringify({ code: 400, msg: reason, data: { error: details } }) });
  jest.mocked(requestJson).mockImplementationOnce(jest.requireActual("@/shared/data/api/http").requestJson);
  try {
    const { setAgentConnector } = jest.requireActual("./connectors");
    await expect(setAgentConnector({ agentKey: "agent", connectorId: "custom-second", enabled: true })).rejects.toMatchObject({ message: reason, data: { error: details } });
  } finally { globalThis.fetch = originalFetch; }
});
