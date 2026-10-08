/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getAdminAgentConnectors, getAdminConnectors, setAdminAgentConnector, setAgentConnector, getAdminTools } from "@/shared/data";
import { AgentConnectorCapabilities } from "./AgentConnectorCapabilities";
import { useAgentConnectorCapabilities } from "../hooks/useAgentConnectorCapabilities";
function Harness({ agentKey }: { agentKey: string }) { return React.createElement(AgentConnectorCapabilities, useAgentConnectorCapabilities(agentKey)); }

jest.mock("@/shared/data", () => ({
  getAdminTools: jest.fn(), getAdminAgentConnectors: jest.fn(), getAdminConnectors: jest.fn(), setAdminAgentConnector: jest.fn(), setAgentConnector: jest.fn(),
}));
const push = { subscribe: jest.fn(() => jest.fn()) };
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ usePushTransport: () => push }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/shared/ui/MaterialIcon", () => ({ MaterialIcon: ({ name }: { name: string }) => React.createElement("span", null, name) }));
jest.mock("@/shared/ui/UiButton", () => ({ UiButton: ({ children, variant: _variant, size: _size, ...props }: any) => React.createElement("button", props, children) }));
jest.mock("./ConnectorIcon", () => ({ ConnectorIcon: () => null }));
jest.mock("antd", () => ({ Spin: () => React.createElement("span", null, "loading") }));

const selection = (agentKey: string, presetConnectorIds = ["builtin.web-control"]) => ({ code: 0, msg: "success", data: {
  agentKey, presetConnectorIds, declaredConnectorIds: ["docs"], connectorIds: [...presetConnectorIds, "docs"], activeConnectorIds: [...presetConnectorIds, "docs"], reloadPending: false,
} });
let root: Root;
let container: HTMLDivElement;
const mount = async (agentKey = "zenmi") => { await act(async () => root.render(React.createElement(Harness, { agentKey }))); };

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  jest.mocked(getAdminTools).mockResolvedValue({ code: 0, msg: "", data: [] });
  jest.mocked(getAdminAgentConnectors).mockResolvedValue(selection("zenmi"));
  jest.mocked(getAdminConnectors).mockResolvedValue({ code: 0, msg: "success", data: { connectors: [
    { id: "builtin.web-control", name: "网页控制", description: "控制网页", version: "1", type: "native", auth_mode: "no_auth", builtin: true, readOnly: true, canDelete: false, hasNative: true, nativeTools: ["awcp_manual"], tools: [{key:"awcp_manual",name:"awcp_manual",label:"Website manual",description:"Read website instructions",kind:"native",sourceType:"native",sourceCategory:"platform"}], hasMcp: false, hasCli: false, hasBin: false, skills: [] },
  ] } });
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); });

it("shows the platform preset in Agent management as a read-only item with no mounting controls", async () => {
  await mount();
  expect(getAdminAgentConnectors).toHaveBeenCalledWith("zenmi");
  expect(container.textContent).toContain("网页控制");
  expect(container.textContent).toContain("agentConsole.tools.preset");
  expect(container.textContent).toContain("Website manual");
  expect(container.textContent).toContain("Read website instructions");
  expect(getAdminTools).not.toHaveBeenCalled();
  expect(container.querySelectorAll("details")).toHaveLength(2);
  expect(container.querySelector("details")?.open).toBe(false);
  expect(container.textContent).toContain("lock");
  expect(container.textContent).toContain("docs");
  expect(container.querySelector("input, button, [role=switch]")).toBeNull();
  expect(setAdminAgentConnector).not.toHaveBeenCalled();
  expect(setAgentConnector).not.toHaveBeenCalled();
});

it("shows an explicit empty state when no connectors are mounted", async () => {
  jest.mocked(getAdminAgentConnectors).mockResolvedValue({code:0,msg:"",data:{agentKey:"zenmi",presetConnectorIds:[],declaredConnectorIds:[],connectorIds:[],activeConnectorIds:[],reloadPending:false}});
  await mount();
  expect(container.textContent).toContain("agents.connectors.empty");
});

it("ignores a late response after selecting a different Agent", async () => {
  let resolve!: (value: ReturnType<typeof selection>) => void;
  jest.mocked(getAdminAgentConnectors).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  await mount();
  jest.mocked(getAdminAgentConnectors).mockResolvedValue(selection("other", []));
  await mount("other");
  await act(async () => resolve(selection("zenmi")));
  expect(container.textContent).not.toContain("网页控制");
});

it("offers retry when the management read fails without invoking a mutation", async () => {
  jest.mocked(getAdminAgentConnectors).mockRejectedValueOnce(new Error("unavailable"));
  await mount();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("agents.connectors.loadFailed");
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(container.textContent).toContain("网页控制");
  expect(setAdminAgentConnector).not.toHaveBeenCalled();
});

it("reuses bindings from the loaded Agent detail without a second Agent request", async () => {
  const bindings = [{ id: "builtin.web-control", source: "preset" as const, active: true }];
  function DetailHarness() {
    return React.createElement(AgentConnectorCapabilities, useAgentConnectorCapabilities("zenmi", bindings));
  }
  await act(async () => root.render(React.createElement(DetailHarness)));
  expect(getAdminAgentConnectors).not.toHaveBeenCalled();
  expect(container.textContent).toContain("网页控制");
});
