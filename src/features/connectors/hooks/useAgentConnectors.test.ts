/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getAgent, getConnectorConnection, setAgentConnector, type ConnectorConnection } from "@/shared/data";
import { createInitialState } from "@/app/state/state";
import { appReducer } from "@/app/state/reducer";
import { useAgentConnectors } from "./useAgentConnectors";
import { useAgentAvailability } from "@/features/composer/hooks/useAgentAvailability";
import { invalidateAgentDetail } from "@/shared/data/api/routedClient";
import { requestDataThroughExecutor } from "@/shared/data/api/dataRequestExecutor";

jest.mock("@/shared/data", () => ({ getAgent: jest.fn(), getConnectorConnection: jest.fn(), setAgentConnector: jest.fn() }));
const push = { subscribe: jest.fn(() => jest.fn()) };
const mockStatusListeners = new Set<(status: string) => void>();
const mockTransport = {
  push,
  getStatus: () => "connecting",
  subscribeStatus: (listener: (status: string) => void) => { mockStatusListeners.add(listener); return () => mockStatusListeners.delete(listener); },
};
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ usePushTransport: () => push, useOptionalRealtimeTransport: () => mockTransport }));
jest.mock("@/shared/data/api/routedClient", () => ({ ...jest.requireActual("@/shared/data/api/routedClient"), invalidateAgentDetail: jest.fn() }));
jest.mock("@/shared/data/api/dataRequestExecutor", () => ({ requestDataThroughExecutor: jest.fn() }));
const mockStateRef = { current: createInitialState() };
const mockListeners = new Set<() => void>();
const mockDispatch = jest.fn();
jest.mock("@/app/state/AppContext", () => ({ useAppContext: () => ({
  state: React.useSyncExternalStore(listener => { mockListeners.add(listener); return () => mockListeners.delete(listener); }, () => mockStateRef.current),
  stateRef: mockStateRef, dispatch: mockDispatch,
}) }));
const response = (key: string, ids: string[]) => ({ code: 0, msg: "", data: { key, name: key, mode: "GENERAL", tools: [], skills: [], connectors: ids, controls: [], meta: {} } });
const saved = (key: string, ids: string[]) => ({ code: 0, msg: "", data: { agentKey: key, connectorIds: ids, reloadPending: true } });
const connection = (id: string, changes: Partial<ConnectorConnection> = {}): ConnectorConnection => ({
  connectorId: id, configured: true, configurationRequired: true, readiness: "ready",
  authentication: { connectorId: id, sessionId: "", status: "authorized", expiresAt: "" },
  capabilities: { canConnect: true, canDisconnect: true, canCheck: true, authMode: "self", authBrowser: "system", hasCli: false, hasMcp: false },
  ...changes,
});
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
let runtime: ReturnType<typeof useAgentConnectors>;
let root: Root;
function Harness({ agentKey }: { agentKey: string }) { runtime = useAgentConnectors(agentKey); return null; }
const mount = async (agentKey = "zenmi") => {
  if (agentKey === "other" && mockStateRef.current.currentAgent?.key !== agentKey) {
    mockStateRef.current.currentAgent = response("other", ["mail"]).data;
  }
  await act(async () => root.render(React.createElement(Harness, { agentKey }))); };

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  jest.useFakeTimers();
  jest.resetAllMocks();
  push.subscribe.mockReturnValue(jest.fn());
  jest.mocked(getConnectorConnection).mockImplementation(async id => ({ code: 0, msg: "", data: connection(id) }));
  mockStateRef.current = { ...createInitialState(), agents: [{key: "zenmi", name: "zenmi"}, {key: "other", name: "other"}], currentAgent: response("zenmi", ["docs", "meeting"]).data, agentAvailability: { zenmi: "available", other: "available" } };
  mockDispatch.mockImplementation(action => { mockStateRef.current = appReducer(mockStateRef.current, action); mockListeners.forEach(listener => listener()); });
  jest.mocked(getAgent).mockResolvedValue(response("zenmi", ["meeting"]));
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); jest.useRealTimers(); });

it("reuses Agent associations on opening and publishes one saved switch to shared Agent state", async () => {
  await mount();
  expect(getAgent).not.toHaveBeenCalled();
  expect(runtime.data?.connectorIds).toEqual(["docs", "meeting"]);
  const pending = deferred<ReturnType<typeof saved>>();
  jest.mocked(setAgentConnector).mockReturnValueOnce(pending.promise);
  await act(async () => {
    void runtime.setSelected("docs", false);
    void runtime.setSelected("docs", false);
    void runtime.setSelected("meeting", false);
    void runtime.setSelected("mail", true);
  });
  expect(setAgentConnector).toHaveBeenCalledTimes(1);
  expect(setAgentConnector).toHaveBeenCalledWith({ agentKey: "zenmi", connectorId: "docs", enabled: false });
  expect(getConnectorConnection).not.toHaveBeenCalled();
  expect(runtime.savingId).toBe("docs");
  expect(runtime.data?.connectorIds).toContain("docs");
  await act(async () => pending.resolve(saved("zenmi", ["meeting"])));
  expect(runtime.data?.connectorIds).toEqual(["meeting"]);
  expect(mockStateRef.current.currentAgent!.connectors).toEqual(["meeting"]);
  expect(runtime.savingId).toBe("");
  expect(runtime.catalogRevision).toBe(1);
  expect(getAgent).not.toHaveBeenCalled();
});

it("waits for Composer Agent hydration without creating a second reader", async () => {
  mockStateRef.current.currentAgent = null;
  mockStateRef.current.agentAvailability.zenmi = "checking";
  await mount();
  expect(runtime.data).toBeNull();
  expect(runtime.loading).toBe(true);
  expect(getAgent).not.toHaveBeenCalled();
  await act(async () => {
    mockDispatch({ type: "SET_CURRENT_AGENT", agent: response("zenmi", ["docs"]).data });
    mockDispatch({ type: "SET_AGENT_AVAILABILITY", agentKey: "zenmi", status: "available" });
  });
  expect(runtime.data?.connectorIds).toEqual(["docs"]);
  expect(getAgent).not.toHaveBeenCalled();
});

it("loads a missing detail through /api/agent and never queries an empty key", async () => {
  mockStateRef.current.currentAgent = null;
  await mount();
  expect(getAgent).toHaveBeenCalledWith("zenmi");
  expect(runtime.data?.connectorIds).toEqual(["meeting"]);
  await mount("");
  expect(runtime.data).toBeNull();
  expect(getAgent).toHaveBeenCalledTimes(1);
});

it("ignores a late save and read after changing Agent", async () => {
  await mount();
  const pending = deferred<ReturnType<typeof saved>>();
  jest.mocked(setAgentConnector).mockReturnValueOnce(pending.promise);
  await act(async () => { void runtime.setSelected("docs", false); });
  await mount("other");
  await act(async () => pending.resolve(saved("zenmi", ["meeting"])));
  expect(runtime.data).toMatchObject({ agentKey: "other", connectorIds: ["mail"] });
  const read = deferred<ReturnType<typeof response>>();
  jest.mocked(getAgent).mockReturnValueOnce(read.promise);
  await act(async () => { void runtime.refresh(); });
  mockStateRef.current.currentAgent = response("zenmi", ["docs", "meeting"]).data;
  await mount("zenmi");
  await act(async () => read.resolve(response("other", [])));
  expect(runtime.data?.connectorIds).toEqual(["docs", "meeting"]);
});

it("confirms source through Agent after a lost save response and keeps the diagnostic", async () => {
  await mount();
  jest.mocked(setAgentConnector).mockRejectedValueOnce(new Error("response lost"));
  await act(async () => runtime.setSelected("docs", false));
  expect(getAgent).toHaveBeenCalledWith("zenmi");
  expect(runtime.data?.connectorIds).toEqual(["meeting"]);
  expect(runtime.saveError?.message).toBe("response lost");
  jest.mocked(getAgent).mockRejectedValueOnce(new Error("offline"));
  await act(async () => runtime.refresh());
  await act(async () => runtime.setSelected("meeting", false));
  expect(runtime.loadError?.message).toBe("offline");
  expect(setAgentConnector).toHaveBeenCalledTimes(1);
});

it("deduplicates lost-response confirmation with Composer availability through the real Agent cache", async () => {
  const routed = jest.requireActual("@/shared/data/api/routedClient");
  jest.requireActual("@/shared/data/query/serverState").dataQueryCache.clear();
  jest.mocked(invalidateAgentDetail).mockImplementation(routed.invalidateAgentDetail);
  jest.mocked(getAgent).mockImplementation(routed.getAgent);
  jest.mocked(requestDataThroughExecutor).mockResolvedValue(response("zenmi", ["docs", "meeting"]));
  function CombinedHarness() {
    useAgentAvailability("zenmi", "");
    return React.createElement(Harness, { agentKey: "zenmi" });
  }
  await act(async () => root.render(React.createElement(CombinedHarness)));
  jest.mocked(requestDataThroughExecutor).mockClear().mockResolvedValue(response("zenmi", ["meeting"]));
  jest.mocked(setAgentConnector).mockRejectedValueOnce(new Error("response lost"));
  await act(async () => runtime.setSelected("docs", false));
  expect(requestDataThroughExecutor).toHaveBeenCalledTimes(1);
  expect(requestDataThroughExecutor).toHaveBeenCalledWith("/api/agent", { agentKey: "zenmi" });
  expect(runtime.data?.connectorIds).toEqual(["meeting"]);
  expect(runtime.saveError?.message).toBe("response lost");
  expect(mockStateRef.current.agentAvailability.zenmi).toBe("available");
});

it("rejects a missing associations field rather than treating every connector as off", async () => {
  mockStateRef.current.currentAgent = null;
  jest.mocked(getAgent).mockResolvedValue({ ...response("zenmi", []), data: { ...response("zenmi", []).data, connectors: undefined } } as never);
  await mount();
  expect(runtime.data).toBeNull();
  expect(runtime.loadError?.message).toContain("unavailable");
  await act(async () => runtime.setSelected("docs", true));
  expect(setAgentConnector).not.toHaveBeenCalled();
});

it("rechecks before enabling and rejects an unlinked account without changing saved associations", async () => {
  jest.mocked(getAgent).mockResolvedValue(response("zenmi", ["docs", "meeting"]));
  await mount();
  jest.mocked(getConnectorConnection).mockResolvedValueOnce({ code: 0, msg: "", data: connection("docs", { configured: false, readiness: "configuration_required" }) });
  await act(async () => runtime.setSelected("docs", true));
  expect(setAgentConnector).not.toHaveBeenCalled();
  expect(runtime.saveError?.message).toBe("connectors.chat.configurationRequired");
  expect(runtime.data?.connectorIds).toEqual(["docs", "meeting"]);
  expect(runtime.savingId).toBe("");
  jest.mocked(setAgentConnector).mockResolvedValue(saved("zenmi", ["docs", "meeting"]));
  await act(async () => runtime.setSelected("docs", true));
  expect(setAgentConnector).toHaveBeenCalledTimes(1);
  expect(runtime.saveError).toBeNull();
});

it("removes a saved mount even when reading the connector account fails", async () => {
  await mount();
  jest.mocked(getConnectorConnection).mockRejectedValue(new Error("connection state offline"));
  await act(async () => runtime.setSelected("mail", true));
  expect(setAgentConnector).not.toHaveBeenCalled();
  expect(runtime.saveError?.message).toBe("connection state offline");
  expect(runtime.data?.connectorIds).toEqual(["docs", "meeting"]);

  jest.mocked(setAgentConnector).mockResolvedValue(saved("zenmi", ["meeting"]));
  await act(async () => runtime.setSelected("docs", false));
  expect(getConnectorConnection).toHaveBeenCalledTimes(1);
  expect(setAgentConnector).toHaveBeenCalledWith({ agentKey: "zenmi", connectorId: "docs", enabled: false });
  expect(runtime.data?.connectorIds).toEqual(["meeting"]);
});

it.each(["preparing", "pending_verification", "authorization_required", "unavailable"])("preserves configured mounting through %s rather than treating readiness as unlink", async readiness => {
  jest.mocked(getConnectorConnection).mockResolvedValue({ code: 0, msg: "", data: connection("docs", { readiness }) });
  jest.mocked(setAgentConnector).mockResolvedValue(saved("zenmi", ["docs"]));
  await mount();
  await act(async () => runtime.setSelected("docs", true));
  expect(setAgentConnector).toHaveBeenCalledWith({ agentKey: "zenmi", connectorId: "docs", enabled: true });
  expect(runtime.saveError).toBeNull();
});

it.each(["delegated", "not_required"] as const)("preserves older builtin CLI switches with %s and no Platform account", async status => {
  const dbx = connection("builtin.dbx", { configured: false, readiness: "configuration_required",
    authentication: { connectorId: "builtin.dbx", sessionId: "", status, expiresAt: "" },
  });
  mockStateRef.current.currentAgent!.connectors = ["builtin.dbx", "wecom"];
  jest.mocked(getConnectorConnection).mockResolvedValue({ code: 0, msg: "", data: dbx });
  jest.mocked(setAgentConnector).mockResolvedValue(saved("zenmi", ["builtin.dbx", "wecom"]));
  await mount();
  await act(async () => runtime.setSelected("builtin.dbx", true));
  expect(setAgentConnector).toHaveBeenCalledWith({ agentKey: "zenmi", connectorId: "builtin.dbx", enabled: true });
  expect(runtime.saveError).toBeNull();
});

it("blocks a new external delegated mount while preserving its saved association", async () => {
  const id = "wecom-cli-connector";
  const unlinked = connection(id, { configured: false, readiness: "configuration_required",
    authentication: { connectorId: id, sessionId: "", status: "delegated", expiresAt: "" },
  });
  mockStateRef.current.currentAgent!.connectors = [id];
  jest.mocked(getAgent).mockResolvedValue(response("zenmi", [id]));
  jest.mocked(getConnectorConnection).mockResolvedValue({ code: 0, msg: "", data: unlinked });
  await mount();
  expect(runtime.data?.connectorIds).toEqual([id]);
  await act(async () => runtime.setSelected(id, true));
  expect(setAgentConnector).not.toHaveBeenCalled();
  expect(runtime.saveError?.message).toBe("connectors.chat.configurationRequired");
  await act(async () => runtime.refresh());
});

it("ignores an enable check from the previous Agent", async () => {
  await mount("other");
  const check = deferred<{ code: number; msg: string; data: ConnectorConnection }>();
  jest.mocked(getConnectorConnection).mockReturnValueOnce(check.promise);
  await act(async () => { void runtime.setSelected("mail", true); });
  await mount();
  await act(async () => check.resolve({ code: 0, msg: "", data: connection("mail") }));
  expect(setAgentConnector).not.toHaveBeenCalled();
  expect(runtime.data?.agentKey).toBe("zenmi");
  expect(runtime.savingId).toBe("");
});

it("restores initial Desktop connector reads after the Frame Port recovers without mounting a picker", async () => {
  mockStateRef.current.currentAgent = null;
  jest.mocked(getAgent).mockRejectedValueOnce(new Error("Desktop Session retired"));
  await mount();
  expect(runtime.data).toBeNull();
  expect(runtime.loadError).toBeTruthy();
  jest.mocked(getAgent).mockResolvedValue(response("zenmi", ["docs", "meeting", "mail"]));
  await act(async () => {
    mockStatusListeners.forEach(listener => listener("disconnected"));
    mockStatusListeners.forEach(listener => listener("connected"));
  });
  expect(runtime.data?.connectorIds).toEqual(["docs", "meeting", "mail"]);
  expect(runtime.loadError).toBeNull();
  expect(setAgentConnector).not.toHaveBeenCalled();
});
