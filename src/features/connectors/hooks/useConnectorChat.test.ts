/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getAgents, getAgentConnectors, getConnectorConnection, prepareConnector, setAgentConnector } from "@/shared/data";
import type { ConnectorConnection, ConnectorSummary } from "@/shared/data";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { useConnectorChat } from "./useConnectorChat";
jest.mock("@/shared/data", () => ({ getAgents: jest.fn(), getAgentConnectors: jest.fn(), getConnectorConnection: jest.fn(), prepareConnector: jest.fn(), setAgentConnector: jest.fn() }));
jest.mock("@/shared/utils/routing", () => ({ isDesktopAppMode: jest.fn() }));
const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));
const item: ConnectorSummary = { id: "installed-one", name: "Installed", version: "1", type: "mcp", auth_mode: "token", hasCli: false, hasMcp: true, hasBin: false, skills: [], builtin: true, readOnly: true };
const connection: ConnectorConnection = { connectorId: item.id, configured: true, configurationRequired: true, readiness: "ready", authentication: { connectorId: item.id, sessionId: "", status: "authorized", expiresAt: "" }, capabilities: { canConnect: false, canDisconnect: true, canCheck: true, authMode: "token", authBrowser: "system", hasCli: false, hasMcp: true } };
const state = { agentKey: "default", connectorIds: [item.id], activeConnectorIds: [item.id], reloadPending: false };
let root: Root;
let actions: ReturnType<typeof useConnectorChat>;
const assign = jest.fn(); const confirmLeave = jest.fn(); const configure = jest.fn();
const originalLocation = window.location;
function Harness({ connector = item, draft = "", dirty = false }: { connector?: ConnectorSummary; draft?: string; dirty?: boolean }) {
  actions = useConnectorChat({ item: connector, draft, dirty, confirmLeave, onConfigurationRequired: configure }); return null;
}
async function mount(props: Parameters<typeof Harness>[0] = {}) { await act(async () => root.render(React.createElement(Harness, props))); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (value: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; jest.resetAllMocks(); jest.useFakeTimers();
  Object.defineProperty(window, "location", { configurable: true, value: { href: "https://example.test/connectors/installed-one?chatDefaultAgentKey=default", assign } });
  jest.mocked(isDesktopAppMode).mockReturnValue(true);
  jest.mocked(getConnectorConnection).mockResolvedValue({ code: 0, msg: "", data: connection });
  jest.mocked(getAgentConnectors).mockResolvedValue({ code: 0, msg: "", data: state });
  jest.mocked(setAgentConnector).mockResolvedValue({ code: 0, msg: "", data: state });
  root = createRoot(document.createElement("div")); confirmLeave.mockReturnValue(false);
});
afterEach(async () => { await act(async () => root.unmount()); jest.useRealTimers(); Object.defineProperty(window, "location", { configurable: true, value: originalLocation }); });
it("uses the host default for ready builtin/readOnly connectors and hands off a pure explicit empty draft", async () => {
  await mount(); await act(async () => actions.open());
  expect(assign).toHaveBeenCalledTimes(1); expect(getAgents).not.toHaveBeenCalled();
  const target = new URL(assign.mock.calls[0][0], "https://example.test");
  expect(target.pathname).toBe("/agent/default"); expect(target.searchParams.get("composerDraft")).toBe("");
  expect(target.searchParams.has("composerDraft")).toBe(true); expect(target.searchParams.has("composerSkill")).toBe(false);
  expect(setAgentConnector).not.toHaveBeenCalled();
});
it("requires confirmed configuration before any Agent mount", async () => {
  jest.mocked(getConnectorConnection).mockResolvedValue({ code: 0, msg: "", data: { ...connection, configured: false, readiness: "configuration_required" } });
  await mount(); await act(async () => actions.open("Synthetic example"));
  expect(actions.error).toBe("connectors.chat.configurationRequired"); expect(configure).toHaveBeenCalledTimes(1);
  expect(setAgentConnector).not.toHaveBeenCalled(); expect(assign).not.toHaveBeenCalled();
});
it("protects a dirty definition without starting preparation or navigation", async () => {
  await mount({ dirty: true, draft: "unsaved" }); await act(async () => actions.open());
  expect(confirmLeave).toHaveBeenCalledTimes(1); expect(getConnectorConnection).not.toHaveBeenCalled(); expect(assign).not.toHaveBeenCalled();
});
it("ignores late read results after switching installed connector IDs", async () => {
  const read = deferred<any>(); jest.mocked(getConnectorConnection).mockReturnValueOnce(read.promise);
  await mount(); let result!: Promise<void>;
  await act(async () => { result = actions.open(); });
  const signal = jest.mocked(getConnectorConnection).mock.calls[0][1]!;
  await mount({ connector: { ...item, id: "installed-two" } }); expect(signal.aborted).toBe(true);
  await act(async () => { read.resolve({ data: connection }); await result; });
  expect(getAgentConnectors).not.toHaveBeenCalled(); expect(assign).not.toHaveBeenCalled();
});
it("keeps changes made during runtime publication instead of navigating away", async () => {
  const read = deferred<any>(); jest.mocked(getAgentConnectors).mockReturnValueOnce(read.promise);
  await mount(); let result!: Promise<void>;
  await act(async () => { result = actions.open(); });
  await mount({ dirty: true, draft: "new unsaved change" });
  await act(async () => { read.resolve({ data: state }); await result; });
  expect(assign).not.toHaveBeenCalled(); expect(actions.error).toBe("connectors.chat.draftChanged");
});
it("uses Standalone's first ordinary Agent and waits for an active mount", async () => {
  jest.mocked(isDesktopAppMode).mockReturnValue(false);
  jest.mocked(getAgents).mockResolvedValue({ code: 0, msg: "", data: [{ key: "team", kind: "team" }, { key: "default", mode: "AGENT" }] } as any);
  jest.mocked(getAgentConnectors).mockResolvedValueOnce({ code: 0, msg: "", data: { ...state, connectorIds: [], activeConnectorIds: [] } });
  jest.mocked(setAgentConnector).mockResolvedValueOnce({ code: 0, msg: "", data: { ...state, activeConnectorIds: [], reloadPending: true } });
  await mount(); let result!: Promise<void>;
  await act(async () => { result = actions.open("Synthetic example"); });
  expect(assign).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(2_000); await result; });
  expect(setAgentConnector).toHaveBeenCalledWith({ agentKey: "default", connectorId: item.id, enabled: true }, expect.any(AbortSignal));
  expect(assign).not.toHaveBeenCalled(); expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(new URL(mockNavigate.mock.calls[0][0], "https://example.test").searchParams.get("composerDraft")).toBe("Synthetic example");
});
it("does not silently choose another Agent when a Desktop default is missing", async () => {
  (window.location as any).href = "https://example.test/connectors/installed-one";
  await mount(); await act(async () => actions.open());
  expect(actions.error).toBe("resourceAssistant.agentUnavailable"); expect(getAgents).not.toHaveBeenCalled(); expect(assign).not.toHaveBeenCalled();
});

it("joins a shared preparation job and stops only its observer when canceled", async () => {
  const cli = { ...item, builtin: false, readOnly: false, hasCli: true };
  const shared = { ...connection, readiness: "preparing", preparation: { connectorId: item.id, status: "preparing" as const }, capabilities: { ...connection.capabilities, hasCli: true } };
  jest.mocked(getConnectorConnection).mockResolvedValue({ code: 0, msg: "", data: shared });
  await mount({ connector: cli }); let result!: Promise<void>;
  await act(async () => { result = actions.open(); });
  expect(actions.phase).toBe("preparing"); expect(prepareConnector).not.toHaveBeenCalled();
  await act(async () => { actions.cancel(); await result; });
  expect(shared.preparation.status).toBe("preparing");
  expect(getAgentConnectors).not.toHaveBeenCalled(); expect(assign).not.toHaveBeenCalled(); expect(actions.error).toBe("");
});

it("does not let a canceled same-ID operation's late error contaminate a new attempt", async () => {
  const old = deferred<any>(); jest.mocked(getConnectorConnection).mockReturnValueOnce(old.promise);
  await mount(); let result!: Promise<void>;
  await act(async () => { result = actions.open(); });
  await act(async () => actions.cancel());
  await act(async () => actions.open());
  expect(assign).toHaveBeenCalledTimes(1);
  await act(async () => { old.reject(new Error("old request failed")); await result; });
  expect(assign).toHaveBeenCalledTimes(1); expect(actions.error).toBe("");
});
it("bounds even an unresponsive state read and distinguishes timeout from user cancellation", async () => {
  jest.mocked(getConnectorConnection).mockReturnValue(new Promise(() => {}));
  await mount(); let result!: Promise<void>;
  await act(async () => { result = actions.open(); });
  await act(async () => { jest.advanceTimersByTime(150_000); await result; });
  expect(actions.error).toBe("connectors.chat.openTimeout"); expect(actions.opening).toBe(false);
  expect(assign).not.toHaveBeenCalled(); expect(getAgentConnectors).not.toHaveBeenCalled();
});
