/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getAgent, setAgentConnector } from "@/shared/data";
import { createInitialState } from "@/app/state/state";
import { appReducer } from "@/app/state/reducer";
import { useAgentConnectors } from "./useAgentConnectors";
import { useAgentAvailability } from "@/features/composer/hooks/useAgentAvailability";
import { invalidateAgentDetail } from "@/shared/data/api/routedClient";
import { requestDataThroughExecutor } from "@/shared/data/api/dataRequestExecutor";

jest.mock("@/shared/data", () => ({ getAgent: jest.fn(), setAgentConnector: jest.fn() }));
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
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
let runtime: ReturnType<typeof useAgentConnectors>;
let root: Root;
function Harness({ agentKey }: { agentKey: string }) { runtime = useAgentConnectors(agentKey); return null; }
const mount = async (agentKey = "zenmi") => { await act(async () => root.render(React.createElement(Harness, { agentKey }))); };

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  jest.resetAllMocks();
  mockStateRef.current = { ...createInitialState(), agents: [response("zenmi", ["docs", "meeting"]).data, response("other", ["mail"]).data], agentAvailability: { zenmi: "available", other: "available" } };
  mockDispatch.mockImplementation(action => { mockStateRef.current = appReducer(mockStateRef.current, action); mockListeners.forEach(listener => listener()); });
  jest.mocked(getAgent).mockResolvedValue(response("zenmi", ["meeting"]));
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); });

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
