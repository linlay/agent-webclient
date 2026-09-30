/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TextDecoder, TextEncoder } from "util";
import { getAdminConnectors, getAdminTools, getAgents, getAgentConnectors, getConnectorConnection, getConnectorDefinition, prepareConnector, setAgentConnector } from "@/shared/data";
import type { ConnectorConnection, ConnectorSummary } from "@/shared/data";
Object.assign(globalThis, { TextDecoder, TextEncoder });
if (typeof globalThis.Request === "undefined") {
  class TestRequest {
    readonly url: string;
    readonly method: string;
    readonly signal?: AbortSignal;
    constructor(input: string | URL | { url: string }, init?: RequestInit) {
      this.url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
      this.method = init?.method || "GET"; this.signal = init?.signal || undefined;
    }
  }
  Object.assign(globalThis, { Request: TestRequest });
}
const { createMemoryRouter, RouterProvider, useNavigate, useParams } = require("react-router-dom") as typeof import("react-router-dom");
const { useConnectorsRuntime } = require("./useConnectorsRuntime") as typeof import("./useConnectorsRuntime");
const { useConnectorChat } = require("./useConnectorChat") as typeof import("./useConnectorChat");
jest.mock("@/shared/data", () => ({ getAdminConnectors: jest.fn(), getAdminTools: jest.fn(), getAgents: jest.fn(), getAgentConnectors: jest.fn(), getConnectorConnection: jest.fn(), getConnectorDefinition: jest.fn(), prepareConnector: jest.fn(), setAgentConnector: jest.fn() }));
jest.mock("@/shared/utils/routing", () => ({ isDesktopAppMode: () => false }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
const push = { subscribe: jest.fn(() => jest.fn()) };
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ usePushTransport: () => push }));
const item: ConnectorSummary = { id: "demo", name: "Installed", version: "1", type: "mcp", auth_mode: "token", hasCli: false, hasMcp: true, hasBin: false, skills: [] };
const connection: ConnectorConnection = { connectorId: item.id, configured: true, configurationRequired: true, readiness: "ready", authentication: { connectorId: item.id, sessionId: "", status: "authorized", expiresAt: "" }, capabilities: { canConnect: false, canDisconnect: true, canCheck: true, authMode: "token", authBrowser: "system", hasCli: false, hasMcp: true } };
const sourceState = { agentKey: "default", connectorIds: [], activeConnectorIds: [], reloadPending: false };
const activeState = { ...sourceState, connectorIds: [item.id], activeConnectorIds: [item.id] };
let runtime: ReturnType<typeof useConnectorsRuntime>;
let chat: ReturnType<typeof useConnectorChat>;
let router: ReturnType<typeof createMemoryRouter>;
let root: Root;
let container: HTMLDivElement;
function Harness() {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  runtime = useConnectorsRuntime(id, next => navigate(`/connectors/${encodeURIComponent(next)}`));
  chat = useConnectorChat({ item: runtime.selected || null, draft: runtime.draft, dirty: runtime.dirty,
    confirmLeave: () => window.confirm("connectors.confirm.discard"), confirmNavigation: runtime.confirmNavigation,
    onConfigurationRequired: () => { if (!runtime.dirty) runtime.selectFile("connector.json"); } });
  return React.createElement("div", null, "connector editor");
}
const edited = '{"name":"Unsaved connector definition"}';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; jest.clearAllMocks();
  jest.mocked(getAdminConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: [item] } });
  jest.mocked(getAdminTools).mockResolvedValue({ code: 0, msg: "", data: [] });
  jest.mocked(getConnectorDefinition).mockImplementation(async target => ({ code: 0, msg: "", data: { ...target, content: '{"name":"Installed"}', sha256: "loaded-hash" } }));
  jest.mocked(getAgents).mockResolvedValue({ code: 0, msg: "", data: [{ key: "default", mode: "AGENT" }] } as any);
  jest.mocked(getConnectorConnection).mockResolvedValue({ code: 0, msg: "", data: connection });
  jest.mocked(getAgentConnectors).mockResolvedValue({ code: 0, msg: "", data: sourceState });
  jest.mocked(setAgentConnector).mockResolvedValue({ code: 0, msg: "", data: activeState });
  jest.spyOn(window, "confirm").mockReturnValue(true);
  router = createMemoryRouter([{ path: "/connectors/:id", element: React.createElement(Harness) }, { path: "/agent/:key", element: React.createElement("div", null, "business chat") }], { initialEntries: ["/connectors/demo"] });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(React.createElement(RouterProvider, { router })));
  await act(async () => runtime.updateDraft(edited));
});
afterEach(async () => { await act(async () => root.unmount()); router.dispose(); container.remove(); jest.restoreAllMocks(); });
it("asks once before preparation and passes the actual Standalone blocker without clearing the dirty draft", async () => {
  await act(async () => chat.open("Synthetic connector example"));
  expect(window.confirm).toHaveBeenCalledTimes(1);
  expect(router.state.location.pathname).toBe("/agent/default");
  expect(new URLSearchParams(router.state.location.search).get("composerDraft")).toBe("Synthetic connector example");
  expect(runtime.draft).toBe(edited); expect(runtime.dirty).toBe(true);
  expect(setAgentConnector).toHaveBeenCalledTimes(1);
});
it("does not prepare or mount when the initial discard confirmation is declined", async () => {
  jest.mocked(window.confirm).mockReturnValue(false);
  await act(async () => chat.open());
  expect(window.confirm).toHaveBeenCalledTimes(1); expect(getConnectorConnection).not.toHaveBeenCalled();
  expect(prepareConnector).not.toHaveBeenCalled(); expect(setAgentConnector).not.toHaveBeenCalled();
  expect(router.state.location.pathname).toBe("/connectors/demo"); expect(runtime.dirty).toBe(true); expect(runtime.draft).toBe(edited);
});
it("invalidates old approval after edits even when the draft is restored to the same text", async () => {
  const pending = deferred<any>(); jest.mocked(getAgentConnectors).mockReturnValueOnce(pending.promise);
  let result!: Promise<void>;
  await act(async () => { result = chat.open(); });
  await act(async () => runtime.updateDraft('{"name":"Changed after confirmation"}'));
  await act(async () => runtime.updateDraft(edited));
  await act(async () => { pending.resolve({ code: 0, msg: "", data: activeState }); await result; });
  expect(window.confirm).toHaveBeenCalledTimes(1); expect(router.state.location.pathname).toBe("/connectors/demo");
  expect(chat.error).toBe("connectors.chat.draftChanged"); expect(runtime.dirty).toBe(true); expect(runtime.draft).toBe(edited);
  jest.mocked(window.confirm).mockReturnValue(false);
  await act(async () => chat.open());
  expect(window.confirm).toHaveBeenCalledTimes(2); expect(router.state.location.pathname).toBe("/connectors/demo");
});
it("retains the normal dirty blocker after a failed operation", async () => {
  jest.mocked(getConnectorConnection).mockRejectedValueOnce(new Error("offline"));
  await act(async () => chat.open());
  expect(window.confirm).toHaveBeenCalledTimes(1); expect(setAgentConnector).not.toHaveBeenCalled();
  expect(runtime.dirty).toBe(true); expect(runtime.draft).toBe(edited);
  jest.mocked(window.confirm).mockReturnValue(false);
  await act(async () => router.navigate("/agent/default?newChat=1790000000000&composerDraft="));
  expect(window.confirm).toHaveBeenCalledTimes(2); expect(router.state.location.pathname).toBe("/connectors/demo");
  expect(runtime.dirty).toBe(true); expect(runtime.draft).toBe(edited);
});
it("preserves a dirty component definition on configuration-required failure without another discard prompt", async () => {
  // Switching files is confirmed independently before this business action.
  await act(async () => runtime.selectFile("mcp.json"));
  await act(async () => runtime.updateDraft(edited));
  jest.mocked(window.confirm).mockClear();
  jest.mocked(getConnectorConnection).mockResolvedValueOnce({ code: 0, msg: "", data: { ...connection, configured: false, readiness: "configuration_required" } });
  await act(async () => chat.open());
  expect(window.confirm).toHaveBeenCalledTimes(1); expect(setAgentConnector).not.toHaveBeenCalled();
  expect(runtime.file).toBe("mcp.json"); expect(runtime.dirty).toBe(true); expect(runtime.draft).toBe(edited);
  expect(router.state.location.pathname).toBe("/connectors/demo");
});
it("consumes an exact destination permit on a different route attempt instead of approving another destination", async () => {
  const target = "/agent/default?newChat=1790000000000&composerDraft=approved";
  const approval = runtime.confirmNavigation()!;
  const revoke = approval.permit(target)!;
  jest.mocked(window.confirm).mockReturnValue(false);
  await act(async () => router.navigate("/agent/default?newChat=1790000000000&composerDraft=different"));
  expect(window.confirm).toHaveBeenCalledTimes(2); expect(router.state.location.pathname).toBe("/connectors/demo");
  await act(async () => router.navigate(target));
  expect(window.confirm).toHaveBeenCalledTimes(3); expect(router.state.location.pathname).toBe("/connectors/demo");
  expect(approval.permit(target)).toBeNull();
  expect(runtime.dirty).toBe(true); expect(runtime.draft).toBe(edited); revoke();
});
