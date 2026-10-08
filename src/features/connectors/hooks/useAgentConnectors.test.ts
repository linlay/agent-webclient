/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getAgentConnectors, getConnectorConnection, getConnectorConnections, setAgentConnector, type ConnectorConnection } from "@/shared/data";
import { useAgentConnectors } from "./useAgentConnectors";

jest.mock("@/shared/data", () => ({ getAgentConnectors: jest.fn(), getConnectorConnection: jest.fn(), getConnectorConnections: jest.fn(), setAgentConnector: jest.fn() }));
const push = { subscribe: jest.fn(() => jest.fn()) };
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ usePushTransport: () => push }));
const response = (key: string, ids: string[], reloadPending = false) => ({ code: 0, msg: "", data: { agentKey: key, connectorIds: ids, reloadPending } });
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
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  jest.resetAllMocks();
  push.subscribe.mockReturnValue(jest.fn());
  jest.mocked(getAgentConnectors).mockResolvedValue(response("zenmi", ["docs", "meeting"]));
  jest.mocked(getConnectorConnections).mockResolvedValue(connections(connection("docs"), connection("meeting"), connection("mail")));
  jest.mocked(getConnectorConnection).mockImplementation(async id => ({ code: 0, msg: "", data: connection(id) }));
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); jest.useRealTimers(); });

it("initializes from zenmi's configured connectors and persists a single switch before changing it", async () => {
  await mount();
  expect(getAgentConnectors).toHaveBeenCalledWith("zenmi");
  expect(runtime.data?.connectorIds).toEqual(["docs", "meeting"]);
  const saved = deferred<ReturnType<typeof response>>();
  jest.mocked(setAgentConnector).mockReturnValueOnce(saved.promise);
  await act(async () => { void runtime.setSelected("docs", false); void runtime.setSelected("docs", false); });
  expect(setAgentConnector).toHaveBeenCalledTimes(1);
  expect(setAgentConnector).toHaveBeenCalledWith({ agentKey: "zenmi", connectorId: "docs", enabled: false });
  expect(runtime.savingId).toBe("docs");
  expect(runtime.data?.connectorIds).toContain("docs");
  await act(async () => saved.resolve(response("zenmi", ["meeting"], true)));
  expect(runtime.data?.connectorIds).toEqual(["meeting"]);
  expect(runtime.data?.reloadPending).toBe(true);
  jest.mocked(getAgentConnectors).mockResolvedValue(response("zenmi", ["meeting"]));
  await act(async () => jest.advanceTimersByTime(2_000));
  expect(runtime.data?.reloadPending).toBe(false);
});

it("ignores a late save from the previous agent", async () => {
  await mount();
  const saved = deferred<ReturnType<typeof response>>();
  jest.mocked(setAgentConnector).mockReturnValueOnce(saved.promise);
  await act(async () => { void runtime.setSelected("docs", false); });
  jest.mocked(getAgentConnectors).mockResolvedValue(response("other", ["mail"]));
  await mount("other");
  await act(async () => saved.resolve(response("zenmi", ["meeting"])));
  expect(runtime.data).toMatchObject({ agentKey: "other", connectorIds: ["mail"] });
  expect(runtime.savingId).toBe("");
});

it("ignores stale reads from the previous agent and does not query an empty agent key", async () => {
  const old = deferred<ReturnType<typeof response>>();
  jest.mocked(getAgentConnectors).mockReturnValueOnce(old.promise);
  await mount();
  jest.mocked(getAgentConnectors).mockResolvedValue(response("other", []));
  await mount("other");
  await act(async () => old.resolve(response("zenmi", ["docs"])));
  expect(runtime.data?.agentKey).toBe("other");
  await mount("");
  expect(runtime.data).toBeNull();
  expect(getAgentConnectors).toHaveBeenCalledTimes(2);
});

it("re-reads source after a failed save and retains a visible error", async () => {
  await mount();
  jest.mocked(setAgentConnector).mockRejectedValueOnce(new Error("reload failed"));
  await act(async () => runtime.setSelected("docs", false));
  expect(runtime.data?.connectorIds).toEqual(["docs", "meeting"]);
  expect(runtime.saveError?.message).toBe("reload failed");
  expect(runtime.savingId).toBe("");
  expect(getAgentConnectors).toHaveBeenCalledTimes(2);
});

it("refreshes external edits and prevents saving after a failed configuration read", async () => {
  await mount();
  const listener = (push.subscribe.mock.calls as unknown as Array<[unknown, (frame: unknown) => void]>)[0][1];
  jest.mocked(getAgentConnectors).mockResolvedValueOnce(response("zenmi", ["mail"]));
  await act(async () => listener({ type: "catalog.updated", data: { reason: "agents" } }));
  expect(runtime.data?.connectorIds).toEqual(["mail"]);
  jest.mocked(getAgentConnectors).mockRejectedValueOnce(new Error("offline"));
  await act(async () => runtime.refresh());
  await act(async () => runtime.setSelected("mail", false));
  expect(runtime.loadError?.message).toBe("offline");
  expect(setAgentConnector).not.toHaveBeenCalled();
});

it("observes WeCom disconnect independently of saved mounts and keeps no_auth connectors available", async () => {
  const dbx = connection("builtin.dbx", {
    configured: false, configurationRequired: false, readiness: "no_auth",
    authentication: { connectorId: "builtin.dbx", sessionId: "", status: "no_auth", expiresAt: "" },
    capabilities: { ...connection("builtin.dbx").capabilities, authMode: "no_auth", authBrowser: "" },
  });
  jest.mocked(getAgentConnectors).mockResolvedValue(response("zenmi", ["wecom", "builtin.dbx"]));
  jest.mocked(getConnectorConnections).mockResolvedValue(connections(connection("wecom"), dbx));
  await mount();
  expect(runtime.availableIds).toEqual(["wecom", "builtin.dbx"]);
  jest.mocked(getConnectorConnections).mockResolvedValue(connections(connection("wecom", { configured: false, readiness: "configuration_required" }), dbx));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(runtime.data?.connectorIds).toEqual(["wecom", "builtin.dbx"]);
  expect(runtime.availableIds).toEqual(["builtin.dbx"]);
  expect(setAgentConnector).not.toHaveBeenCalled();
  await act(async () => root.render(null));
  await mount();
  expect(runtime.availableIds).toEqual(["builtin.dbx"]);
});

it("refreshes shared connection state while the menu stays open without changing mounts", async () => {
  await mount();
  jest.mocked(getConnectorConnections).mockResolvedValue(connections(connection("docs", { configured: false, readiness: "configuration_required" }), connection("meeting")));
  await act(async () => jest.advanceTimersByTime(30_000));
  expect(runtime.data?.connectorIds).toEqual(["docs", "meeting"]);
  expect(runtime.availableIds).toEqual(["meeting"]);
  expect(setAgentConnector).not.toHaveBeenCalled();
});

it("rechecks a connector before enabling and rejects a disconnected account without mounting it", async () => {
  await mount();
  jest.mocked(getConnectorConnection).mockResolvedValueOnce({ code: 0, msg: "", data: connection("docs", { configured: false, readiness: "configuration_required" }) });
  jest.mocked(getConnectorConnections).mockResolvedValue(connections(connection("docs", { configured: false, readiness: "configuration_required" }), connection("meeting")));
  await act(async () => runtime.setSelected("docs", true));
  expect(setAgentConnector).not.toHaveBeenCalled();
  expect(runtime.saveError?.message).toBe("connectors.chat.configurationRequired");
  expect(runtime.availableIds).toEqual(["meeting"]);
  expect(runtime.savingId).toBe("");
  jest.mocked(setAgentConnector).mockResolvedValue(response("zenmi", ["docs", "meeting"]));
  await act(async () => runtime.setSelected("docs", true));
  expect(setAgentConnector).toHaveBeenCalledTimes(1);
  expect(runtime.availableIds).toContain("docs");
  expect(runtime.saveError).toBeNull();
});

it("keeps unreadable connection state as a retryable load error and prevents edits", async () => {
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

it.each(["preparing", "pending_verification", "authorization_required", "unavailable"])("preserves configured mounting through %s instead of treating it as account unlink", async readiness => {
  jest.mocked(getConnectorConnections).mockResolvedValue(connections(connection("docs", { readiness })));
  jest.mocked(getConnectorConnection).mockResolvedValue({ code: 0, msg: "", data: connection("docs", { readiness }) });
  jest.mocked(setAgentConnector).mockResolvedValue(response("zenmi", ["docs"]));
  await mount();
  expect(runtime.availableIds).toEqual(["docs"]);
  await act(async () => runtime.setSelected("docs", true));
  expect(setAgentConnector).toHaveBeenCalledWith({ agentKey: "zenmi", connectorId: "docs", enabled: true });
  expect(runtime.saveError).toBeNull();
});

it.each(["delegated", "not_required"] as const)("preserves older builtin CLI switches with %s configuration and no Platform account", async status => {
  const dbx = connection("builtin.dbx", { configured: false, readiness: "configuration_required",
    authentication: { connectorId: "builtin.dbx", sessionId: "", status, expiresAt: "" },
  });
  jest.mocked(getAgentConnectors).mockResolvedValue(response("zenmi", ["builtin.dbx", "wecom"]));
  jest.mocked(getConnectorConnections).mockResolvedValue(connections(dbx, connection("wecom", { configured: false, readiness: "configuration_required" })));
  jest.mocked(getConnectorConnection).mockResolvedValue({ code: 0, msg: "", data: dbx });
  jest.mocked(setAgentConnector).mockResolvedValue(response("zenmi", ["builtin.dbx", "wecom"]));
  await mount();
  expect(runtime.availableIds).toEqual(["builtin.dbx"]);
  await act(async () => runtime.setSelected("builtin.dbx", true));
  expect(setAgentConnector).toHaveBeenCalledWith({ agentKey: "zenmi", connectorId: "builtin.dbx", enabled: true });
  expect(runtime.saveError).toBeNull();
});

it("keeps external delegated WeCom off after unlink instead of confusing it with a builtin CLI", async () => {
  const id = "wecom-cli-connector";
  const unlinked = connection(id, { configured: false, readiness: "configuration_required",
    authentication: { connectorId: id, sessionId: "", status: "delegated", expiresAt: "" },
  });
  jest.mocked(getAgentConnectors).mockResolvedValue(response("zenmi", [id]));
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

it("ignores connection snapshots and enable checks from a previous Agent scope", async () => {
  const old = deferred<ReturnType<typeof connections>>();
  jest.mocked(getConnectorConnections).mockReturnValueOnce(old.promise);
  await mount();
  jest.mocked(getAgentConnectors).mockResolvedValue(response("other", ["mail"]));
  await mount("other");
  await act(async () => old.resolve(connections(connection("docs", { configured: false, readiness: "configuration_required" }))));
  expect(runtime.data?.agentKey).toBe("other");
  expect(runtime.availableIds).toContain("mail");
  const check = deferred<{ code: number; msg: string; data: ConnectorConnection }>();
  jest.mocked(getConnectorConnection).mockReturnValueOnce(check.promise);
  await act(async () => { void runtime.setSelected("mail", true); });
  jest.mocked(getAgentConnectors).mockResolvedValue(response("zenmi", ["docs"]));
  await mount();
  await act(async () => check.resolve({ code: 0, msg: "", data: connection("mail") }));
  expect(setAgentConnector).not.toHaveBeenCalled();
  expect(runtime.data?.agentKey).toBe("zenmi");
  expect(runtime.savingId).toBe("");
});
