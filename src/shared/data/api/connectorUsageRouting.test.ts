import {
  getConnectors, getAgentConnectors, setAgentConnector,
  getAdminConnectors, getAdminAgentConnectors, setAdminAgentConnector,
} from "@/shared/data";
import { requestJson } from "@/shared/data/api/http";
import { requestDataThroughExecutor } from "@/shared/data/api/dataRequestExecutor";
import { getBackendMode } from "@/shared/config/backendMode";

jest.mock("@/shared/data/api/http", () => ({
  ...jest.requireActual("@/shared/data/api/http"), requestJson: jest.fn(),
}));
jest.mock("@/shared/data/api/dataRequestExecutor", () => ({ requestDataThroughExecutor: jest.fn() }));
jest.mock("@/shared/config/backendMode", () => ({
  ...jest.requireActual("@/shared/config/backendMode"), getBackendMode: jest.fn(),
}));

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getBackendMode).mockReturnValue("platform");
});

it("routes the usage catalog, mount reads and both switch values over the Platform WebSocket without caching", async () => {
  const catalog = { code: 0, msg: "success", data: { connectors: [{ id: "docs", name: "Docs" }] } };
  const selection = { code: 0, msg: "success", data: { agentKey: "demo", connectorIds: ["docs"], reloadPending: true } };
  jest.mocked(requestDataThroughExecutor).mockResolvedValueOnce(catalog).mockResolvedValue(selection);
  await expect(getConnectors("demo")).resolves.toEqual(catalog);
  await expect(getAgentConnectors("demo")).resolves.toEqual(selection);
  for (const enabled of [false, true]) {
    await expect(setAgentConnector({ agentKey: "demo", connectorId: "docs", enabled })).resolves.toEqual(selection);
  }
  await getConnectors("demo");
  await getAgentConnectors("demo");
  await getConnectors();
  expect(jest.mocked(requestDataThroughExecutor).mock.calls).toEqual([
    ["/api/connectors", { agentKey: "demo" }],
    ["/api/agents/connectors", { agentKey: "demo" }],
    ["/api/agents/connectors", { agentKey: "demo", connectorId: "docs", enabled: false }],
    ["/api/agents/connectors", { agentKey: "demo", connectorId: "docs", enabled: true }],
    ["/api/connectors", { agentKey: "demo" }],
    ["/api/agents/connectors", { agentKey: "demo" }],
    ["/api/connectors", undefined],
  ]);
  expect(requestJson).not.toHaveBeenCalled();
});

it("keeps unsupported Gateway usage calls on uncached HTTP and forwards cancellation", async () => {
  jest.mocked(getBackendMode).mockReturnValue("gateway");
  const { signal } = new AbortController();
  const mutation = { agentKey: "demo", connectorId: "docs", enabled: false };
  await getConnectors("demo & other", signal);
  await getAgentConnectors("demo & other", signal);
  await setAgentConnector(mutation, signal);
  expect(jest.mocked(requestJson).mock.calls).toEqual([
    ["/api/connectors?agentKey=demo+%26+other", { cache: "no-store", signal }],
    ["/api/agents/connectors?agentKey=demo+%26+other", { cache: "no-store", signal }],
    ["/api/agents/connectors", { method: "PUT", body: JSON.stringify(mutation), cache: "no-store", signal }],
  ]);
  expect(requestDataThroughExecutor).not.toHaveBeenCalled();
});

it("forwards cancellation through the routed Platform executor", async () => {
  const { signal } = new AbortController();
  await getConnectors("demo", signal);
  await getAgentConnectors("demo", signal);
  await setAgentConnector({ agentKey: "demo", connectorId: "docs", enabled: false }, signal);
  expect(jest.mocked(requestDataThroughExecutor).mock.calls.every(call => call[2]?.signal === signal)).toBe(true);
  expect(requestDataThroughExecutor).toHaveBeenCalledTimes(3);
  expect(requestJson).not.toHaveBeenCalled();
});

it.each([
  ["catalog", () => getConnectors("demo")],
  ["mount read", () => getAgentConnectors("demo")],
  ["switch write", () => setAgentConnector({ agentKey: "demo", connectorId: "docs", enabled: true })],
] as const)("propagates %s errors without HTTP fallback or mutation replay", async (_name, request) => {
  for (const error of [
    Object.assign(new Error("connection lost"), { code: "WS_DISCONNECTED" }),
    Object.assign(new Error("timeout"), { code: "PLATFORM_REQUEST_TIMEOUT" }),
    Object.assign(new Error("conflict"), { status: 400, data: { error: { code: "connector_selection_conflict", conflictingConnectorIds: ["mail"] } } }),
  ]) {
    jest.mocked(requestDataThroughExecutor).mockRejectedValueOnce(error);
    await expect(request()).rejects.toBe(error);
  }
  expect(requestDataThroughExecutor).toHaveBeenCalledTimes(3);
  expect(requestJson).not.toHaveBeenCalled();
});

it("keeps management directory and mounting calls on HTTP", async () => {
  await getAdminConnectors();
  await getAdminAgentConnectors("demo");
  await setAdminAgentConnector({ agentKey: "demo", connectorId: "docs", enabled: true });
  expect(jest.mocked(requestJson).mock.calls.map(call => call[0])).toEqual([
    "/api/admin/connectors", "/api/admin/agents/connectors?agentKey=demo", "/api/admin/agents/connectors",
  ]);
  expect(requestDataThroughExecutor).not.toHaveBeenCalled();
});
