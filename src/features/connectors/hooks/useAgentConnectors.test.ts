/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getAgentConnectors, setAgentConnector } from "@/shared/data";
import { useAgentConnectors } from "./useAgentConnectors";

jest.mock("@/shared/data", () => ({ getAgentConnectors: jest.fn(), setAgentConnector: jest.fn() }));
const push = { subscribe: jest.fn(() => jest.fn()) };
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ usePushTransport: () => push }));
const response = (key: string, ids: string[], reloadPending = false) => ({ code: 0, msg: "", data: { agentKey: key, connectorIds: ids, activeConnectorIds: reloadPending ? [] : ids, reloadPending } });
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
