/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getAgent, getConnectorConnection, getConnectorConnections, setAgentConnector, type ConnectorConnection } from "@/shared/data";
import { createInitialState } from "@/app/state/state";
import { appReducer } from "@/app/state/reducer";
import { useAgentConnectors } from "./useAgentConnectors";
import { useAgentAvailability } from "@/features/composer/hooks/useAgentAvailability";
import { invalidateAgentDetail } from "@/shared/data/api/routedClient";
import { requestDataThroughExecutor } from "@/shared/data/api/dataRequestExecutor";

jest.mock("@/shared/data", () => ({ getAgent: jest.fn(), getConnectorConnection: jest.fn(), getConnectorConnections: jest.fn(), setAgentConnector: jest.fn() }));
const push = { subscribe: jest.fn(() => jest.fn()) };
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ usePushTransport: () => push, useOptionalRealtimeTransport: () => null }));
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
  capabilities: { canConnect: true, canDisconnect: true, canCheck: true, authMode: null, authBrowser: "system", hasCli: false, hasMcp: false },
  ...changes,
});
const connections = (...items: ConnectorConnection[]) => ({ code: 0, msg: "", data: { connections: items } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
let runtime: ReturnType<typeof useAgentConnectors>;
let root: Root;
function Harness({ agentKey }: { agentKey: string }) { runtime = useAgentConnectors(agentKey); return null; }
const mount = async (agentKey = "zenmi") => { await act(async () => root.render(React.createElement(Harness, { agentKey }))); };

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  jest.useFakeTimers();
  jest.resetAllMocks();
  push.subscribe.mockReturnValue(jest.fn());
  jest.mocked(getConnectorConnections).mockResolvedValue(connections(connection("docs"), connection("meeting"), connection("mail")));
  jest.mocked(getConnectorConnection).mockImplementation(async id => ({ code: 0, msg: "", data: connection(id) }));
  mockStateRef.current = { ...createInitialState(), agents: [response("zenmi", ["docs", "meeting"]).data, response("other", ["mail"]).data], agentAvailability: { zenmi: "available", other: "available" } };
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
  await act(async () => { void runtime.setSelected("docs", false); void runtime.setSelected("docs", false); });
  expect(setAgentConnector).toHaveBeenCalledTimes(1);
  expect(setAgentConnector).toHaveBeenCalledWith({ agentKey: "zenmi", connectorId: "docs", enabled: false });
  expect(runtime.data?.connectorIds).toContain("docs");
  await act(async () => pending.resolve(saved("zenmi", ["meeting"])));
  expect(runtime.data?.connectorIds).toEqual(["meeting"]);
  expect(mockStateRef.current.agents[0].connectors).toEqual(["meeting"]);
  expect(runtime.catalogRevision).toBe(1);
  expect(getAgent).not.toHaveBeenCalled();
});

it("waits for Composer Agent hydration without creating a second reader", async () => {
  mockStateRef.current.agents = [{ key: "zenmi", name: "zenmi" }];
  mockStateRef.current.agentAvailability.zenmi = "checking";
  await mount();
  expect(runtime.data).toBeNull();
  expect(runtime.loading).toBe(true);
  expect(getAgent).not.toHaveBeenCalled();
  await act(async () => {
    mockDispatch({ type: "SET_AGENTS", agents: [response("zenmi", ["docs"]).data] });
    mockDispatch({ type: "SET_AGENT_AVAILABILITY", agentKey: "zenmi", status: "available" });
  });
  expect(runtime.data?.connectorIds).toEqual(["docs"]);
  expect(getAgent).not.toHaveBeenCalled();
});

it("loads a missing detail through /api/agent and never queries an empty key", async () => {
  mockStateRef.current.agents = [];
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
  mockStateRef.current.agents = [];
  jest.mocked(getAgent).mockResolvedValue({ ...response("zenmi", []), data: { ...response("zenmi", []).data, connectors: undefined } } as never);
  await mount();
  expect(runtime.data).toBeNull();
  expect(runtime.loadError?.message).toContain("unavailable");
  await act(async () => runtime.setSelected("docs", true));
  expect(setAgentConnector).not.toHaveBeenCalled();
});

it("observes account unlink independently of saved associations and keeps no_auth connectors available", async () => {
  const dbx = connection("builtin.dbx", {
    configured: false, configurationRequired: false, readiness: "no_auth",
    authentication: { connectorId: "builtin.dbx", sessionId: "", status: "no_auth", expiresAt: "" },
    capabilities: { ...connection("builtin.dbx").capabilities, authMode: "no_auth", authBrowser: "" },
  });
  mockStateRef.current.agents[0].connectors = ["wecom", "builtin.dbx"];
  jest.mocked(getConnectorConnections).mockResolvedValue(connections(connection("wecom"), dbx));
  await mount();
  expect(runtime.availableIds).toEqual(["wecom", "builtin.dbx"]);
  jest.mocked(getConnectorConnections).mockResolvedValue(connections(connection("wecom", { configured: false, readiness: "configuration_required" }), dbx));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(runtime.data?.connectorIds).toEqual(["wecom", "builtin.dbx"]);
  expect(mockStateRef.current.agents[0].connectors).toEqual(["wecom", "builtin.dbx"]);
  expect(runtime.availableIds).toEqual(["builtin.dbx"]);
  expect(runtime.catalogRevision).toBe(1);
  expect(setAgentConnector).not.toHaveBeenCalled();
  expect(getAgent).not.toHaveBeenCalled();
  await act(async () => root.render(null));
  await mount();
  expect(runtime.availableIds).toEqual(["builtin.dbx"]);
});

it("refreshes only configuration on push and periodic checks without fading switches or duplicating Agent reads", async () => {
  await mount();
  const listener = (push.subscribe.mock.calls as unknown as Array<[unknown, (frame: unknown) => void]>)[0][1];
  await act(async () => listener({ type: "catalog.updated", data: { reason: "connectors" } }));
  expect(runtime.catalogRevision).toBe(0);
  const pending = deferred<ReturnType<typeof connections>>();
  jest.mocked(getConnectorConnections).mockReturnValueOnce(pending.promise);
  await act(async () => jest.advanceTimersByTime(30_000));
  expect(runtime.loading).toBe(false);
  expect(runtime.data?.connectorIds).toEqual(["docs", "meeting"]);
  await act(async () => pending.resolve(connections(connection("docs", { configured: false, readiness: "configuration_required" }), connection("meeting"))));
  expect(runtime.availableIds).toEqual(["meeting"]);
  expect(runtime.catalogRevision).toBe(1);
  expect(getAgent).not.toHaveBeenCalled();
  expect(setAgentConnector).not.toHaveBeenCalled();
});

it("rechecks before enabling and rejects an unlinked account without changing saved associations", async () => {
  jest.mocked(getAgent).mockResolvedValue(response("zenmi", ["docs", "meeting"]));
  await mount();
  jest.mocked(getConnectorConnection).mockResolvedValueOnce({ code: 0, msg: "", data: connection("docs", { configured: false, readiness: "configuration_required" }) });
  jest.mocked(getConnectorConnections).mockResolvedValue(connections(connection("docs", { configured: false, readiness: "configuration_required" }), connection("meeting")));
  await act(async () => runtime.setSelected("docs", true));
  expect(setAgentConnector).not.toHaveBeenCalled();
  expect(runtime.saveError?.message).toBe("connectors.chat.configurationRequired");
  expect(runtime.data?.connectorIds).toEqual(["docs", "meeting"]);
  expect(runtime.availableIds).toEqual(["meeting"]);
  expect(runtime.savingId).toBe("");
  jest.mocked(setAgentConnector).mockResolvedValue(saved("zenmi", ["docs", "meeting"]));
  await act(async () => runtime.setSelected("docs", true));
  expect(setAgentConnector).toHaveBeenCalledTimes(1);
  expect(runtime.availableIds).toContain("docs");
  expect(runtime.saveError).toBeNull();
});

it("keeps unreadable connection configuration retryable and prevents edits", async () => {
  jest.mocked(getConnectorConnections).mockRejectedValueOnce(new Error("connection state offline"));
  await mount();
  expect(runtime.data).toBeNull();
  expect(runtime.availableIds).toEqual([]);
  expect(runtime.loadError?.message).toBe("connection state offline");
  await act(async () => runtime.setSelected("docs", true));
  expect(setAgentConnector).not.toHaveBeenCalled();
  await act(async () => runtime.refresh());
  expect(runtime.loadError).toBeNull();
  expect(runtime.availableIds).toContain("docs");
});

it.each(["preparing", "pending_verification", "authorization_required", "unavailable"])("preserves configured mounting through %s rather than treating readiness as unlink", async readiness => {
  jest.mocked(getConnectorConnections).mockResolvedValue(connections(connection("docs", { readiness })));
  jest.mocked(getConnectorConnection).mockResolvedValue({ code: 0, msg: "", data: connection("docs", { readiness }) });
  jest.mocked(setAgentConnector).mockResolvedValue(saved("zenmi", ["docs"]));
  await mount();
  expect(runtime.availableIds).toEqual(["docs"]);
  await act(async () => runtime.setSelected("docs", true));
  expect(setAgentConnector).toHaveBeenCalledWith({ agentKey: "zenmi", connectorId: "docs", enabled: true });
  expect(runtime.saveError).toBeNull();
});

it.each(["delegated", "not_required"] as const)("preserves older builtin CLI switches with %s and no Platform account", async status => {
  const dbx = connection("builtin.dbx", { configured: false, readiness: "configuration_required",
    authentication: { connectorId: "builtin.dbx", sessionId: "", status, expiresAt: "" },
  });
  mockStateRef.current.agents[0].connectors = ["builtin.dbx", "wecom"];
  jest.mocked(getConnectorConnections).mockResolvedValue(connections(dbx, connection("wecom", { configured: false, readiness: "configuration_required" })));
  jest.mocked(getConnectorConnection).mockResolvedValue({ code: 0, msg: "", data: dbx });
  jest.mocked(setAgentConnector).mockResolvedValue(saved("zenmi", ["builtin.dbx", "wecom"]));
  await mount();
  expect(runtime.availableIds).toEqual(["builtin.dbx"]);
  await act(async () => runtime.setSelected("builtin.dbx", true));
  expect(setAgentConnector).toHaveBeenCalledWith({ agentKey: "zenmi", connectorId: "builtin.dbx", enabled: true });
  expect(runtime.saveError).toBeNull();
});

it("keeps external delegated WeCom off after unlink without treating it as a builtin CLI", async () => {
  const id = "wecom-cli-connector";
  const unlinked = connection(id, { configured: false, readiness: "configuration_required",
    authentication: { connectorId: id, sessionId: "", status: "delegated", expiresAt: "" },
  });
  mockStateRef.current.agents[0].connectors = [id];
  jest.mocked(getAgent).mockResolvedValue(response("zenmi", [id]));
  jest.mocked(getConnectorConnections).mockResolvedValue(connections(unlinked));
  jest.mocked(getConnectorConnection).mockResolvedValue({ code: 0, msg: "", data: unlinked });
  await mount();
  expect(runtime.data?.connectorIds).toEqual([id]);
  expect(runtime.availableIds).toEqual([]);
  await act(async () => runtime.setSelected(id, true));
  expect(setAgentConnector).not.toHaveBeenCalled();
  expect(runtime.saveError?.message).toBe("connectors.chat.configurationRequired");
  jest.mocked(getConnectorConnections).mockResolvedValue(connections({ ...unlinked, configured: true, readiness: "ready" }));
  await act(async () => runtime.refresh());
  expect(runtime.availableIds).toEqual([id]);
});

it("ignores configuration snapshots and enable checks from the previous Agent", async () => {
  const old = deferred<ReturnType<typeof connections>>();
  jest.mocked(getConnectorConnections).mockReturnValueOnce(old.promise);
  await mount();
  await mount("other");
  await act(async () => old.resolve(connections(connection("docs", { configured: false, readiness: "configuration_required" }))));
  expect(runtime.data?.agentKey).toBe("other");
  expect(runtime.availableIds).toContain("mail");
  const check = deferred<{ code: number; msg: string; data: ConnectorConnection }>();
  jest.mocked(getConnectorConnection).mockReturnValueOnce(check.promise);
  await act(async () => { void runtime.setSelected("mail", true); });
  await mount();
  await act(async () => check.resolve({ code: 0, msg: "", data: connection("mail") }));
  expect(setAgentConnector).not.toHaveBeenCalled();
  expect(runtime.data?.agentKey).toBe("zenmi");
  expect(runtime.savingId).toBe("");
});

it("ignores snapshots started before saving and processes a refresh requested during saving", async () => {
  await mount();
  const old = deferred<ReturnType<typeof connections>>();
  jest.mocked(getConnectorConnections).mockReturnValueOnce(old.promise);
  await act(async () => window.dispatchEvent(new Event("focus")));
  const pending = deferred<ReturnType<typeof saved>>();
  jest.mocked(setAgentConnector).mockReturnValueOnce(pending.promise);
  await act(async () => { void runtime.setSelected("docs", false); });
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    old.resolve(connections());
  });
  expect(runtime.availableIds).toContain("meeting");
  expect(getConnectorConnections).toHaveBeenCalledTimes(2);
  await act(async () => pending.resolve(saved("zenmi", ["meeting"])));
  expect(getConnectorConnections).toHaveBeenCalledTimes(3);
  expect(runtime.data?.connectorIds).toEqual(["meeting"]);
  expect(runtime.availableIds).toContain("meeting");
});
