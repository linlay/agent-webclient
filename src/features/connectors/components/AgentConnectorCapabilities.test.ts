/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getAdminAgentConnectors, getAdminConnectors, setAdminAgentConnector, setAgentConnector, getAdminTools, type ConnectorSummary } from "@/shared/data";
import { AgentConnectorCapabilities } from "./AgentConnectorCapabilities";
import { useAgentConnectorCapabilities } from "../hooks/useAgentConnectorCapabilities";
function Harness({ agentKey }: { agentKey: string }) { return React.createElement(AgentConnectorCapabilities, useAgentConnectorCapabilities(agentKey)); }

jest.mock("@/shared/data", () => ({
  getAdminTools: jest.fn(), getAdminAgentConnectors: jest.fn(), getAdminConnectors: jest.fn(), setAdminAgentConnector: jest.fn(), setAgentConnector: jest.fn(),
}));
const push = { subscribe: jest.fn(() => jest.fn()) };
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ usePushTransport: () => push }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string, vars?: Record<string, unknown>) => vars?.name ? `${key}:${vars.name}` : key }) }));
jest.mock("@/shared/ui/MaterialIcon", () => ({ MaterialIcon: ({ name }: { name: string }) => React.createElement("span", null, name) }));
jest.mock("@/shared/ui/UiButton", () => ({ UiButton: ({ children, variant: _variant, size: _size, ...props }: any) => React.createElement("button", props, children) }));
jest.mock("./ConnectorIcon", () => ({ ConnectorIcon: () => null }));
jest.mock("antd", () => ({
  Spin: () => React.createElement("span", null, "loading"),
  Input: ({ prefix: _prefix, ...props }: any) => React.createElement("input", props),
  Popover: ({ children, content, open, onOpenChange }: any) => React.createElement("div", null,
    React.cloneElement(children, { onClick: () => onOpenChange(!open) }), open && content),
}));

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
    { id: "builtin.web-control", name: "网页控制", description: "控制网页", version: "1", type: "native", authMode: "none", builtin: true, readOnly: true, canDelete: false, hasNative: true, nativeTools: ["awcp_manual"], tools: [{key:"awcp_manual",name:"awcp_manual",label:"Website manual",description:"Read website instructions",kind:"native",sourceType:"native",sourceCategory:"platform"}], hasMcp: false, hasCli: false, hasBin: false, skills: [] },
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

const extraConnector: ConnectorSummary = { id: "builtin.httpx", name: "HTTP", version: "1", type: "cli", authMode: "none", builtin: true, readOnly: true, canDelete: false, hasMcp: false, hasCli: true, hasBin: false, skills: [] };
const draftChanged = jest.fn();
const savedIds = ["docs"];
const bindings = [{ id: "builtin.web-control", source: "preset" as const, active: true }, { id: "docs", source: "agent" as const, active: true }];
function EditorHarness({ initialIds = savedIds, create = false, disabled = false }: { initialIds?: string[]; create?: boolean; disabled?: boolean }) {
  const [ids, setIds] = React.useState(initialIds);
  return React.createElement(AgentConnectorCapabilities, { ...useAgentConnectorCapabilities(create ? "" : "zenmi", create ? null : bindings),
    agentKey: create ? "" : "zenmi", savedIds: create ? [] : savedIds, selectedIds: ids, disabled,
    onSelectionChange: next => { draftChanged(next); setIds(next); },
  });
}
async function mountEditor(props = {}) {
  const catalog = await jest.mocked(getAdminConnectors)();
  jest.mocked(getAdminConnectors).mockResolvedValue({ ...catalog, data: { connectors: [...catalog.data.connectors, extraConnector] } });
  jest.mocked(getAdminConnectors).mockClear();
  draftChanged.mockClear();
  await act(async () => root.render(React.createElement(EditorHarness, props)));
}
const click = async (button: HTMLButtonElement) => act(async () => button.click());
const manage = () => container.querySelector<HTMLButtonElement>('[aria-expanded]')!;
const checkbox = (name: string) => Array.from(container.querySelectorAll("label")).find(label => label.textContent?.includes(name))!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;

it("edits a draft, locks presets and lets a read-only builtin package be mounted and removed", async () => {
  await mountEditor();
  await click(manage());
  expect(checkbox("网页控制").checked).toBe(true);
  expect(checkbox("网页控制").disabled).toBe(true);
  expect(checkbox("HTTP").disabled).toBe(false);
  await act(async () => checkbox("HTTP").click());
  expect(draftChanged).toHaveBeenLastCalledWith(["docs", "builtin.httpx"]);
  expect(container.textContent).toContain("agents.connectors.draftAdded");
  expect(container.querySelector('a')?.getAttribute("href")).toBe("/connectors");
  await click(container.querySelector<HTMLButtonElement>('[aria-label="agents.connectors.removeNamed:HTTP"]')!);
  expect(draftChanged).toHaveBeenLastCalledWith(["docs"]);
  expect(container.textContent).not.toContain("agents.connectors.draftAdded");
  expect(setAdminAgentConnector).not.toHaveBeenCalled();
  expect(setAgentConnector).not.toHaveBeenCalled();
});

it("allows removing and restoring a missing declared connector while retaining its live status", async () => {
  await mountEditor();
  await click(container.querySelector<HTMLButtonElement>('[aria-label="agents.connectors.removeNamed:docs"]')!);
  expect(draftChanged).toHaveBeenLastCalledWith([]);
  const card = Array.from(container.querySelectorAll("details")).find(item => item.textContent?.includes("docs"))!;
  expect(card.textContent).toContain("agents.connectors.draftRemoved");
  expect(card.textContent).toContain("agents.connectors.active");
  expect(card.textContent).toContain("agents.connectors.missing");
  await click(container.querySelector<HTMLButtonElement>('[aria-label="agents.connectors.restoreNamed:docs"]')!);
  expect(draftChanged).toHaveBeenLastCalledWith(["docs"]);
  expect(container.textContent).not.toContain("agents.connectors.draftRemoved");
});

it("validates conflicts against the full selection including presets while searching", async () => {
  await mountEditor();
  jest.mocked(getAdminConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: [{ ...extraConnector, mutuallyExclusiveWith: ["builtin.web-control"] }] } });
  await act(async () => window.dispatchEvent(new Event("focus")));
  await click(manage());
  const input = container.querySelector<HTMLInputElement>('input[aria-label="agents.connectors.search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "HTTP");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(container.querySelectorAll('label')).toHaveLength(1);
  await act(async () => checkbox("HTTP").click());
  expect(draftChanged).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("selectionConflict");
});

it("refreshes mounting status without replacing unsaved selections", async () => {
  await mountEditor();
  await click(manage());
  await act(async () => checkbox("HTTP").click());
  jest.mocked(getAdminAgentConnectors).mockResolvedValue({ ...selection("zenmi"), data: { ...selection("zenmi").data, activeConnectorIds: ["builtin.web-control"], reloadPending: true } });
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(getAdminAgentConnectors).toHaveBeenCalledTimes(1);
  expect(checkbox("HTTP").checked).toBe(true);
  expect(container.textContent).toContain("agents.connectors.draftAdded");
  expect(container.textContent).toContain("agents.connectors.pending");
  const docs = Array.from(container.querySelectorAll("details")).find(item => item.textContent?.includes("docs"))!;
  expect(docs.textContent).toContain("agents.connectors.inactive");
});

it("supports new Agent selections without reading a nonexistent Agent", async () => {
  await mountEditor({ initialIds: [], create: true });
  await click(manage());
  await act(async () => checkbox("HTTP").click());
  expect(draftChanged).toHaveBeenLastCalledWith(["builtin.httpx"]);
  expect(getAdminAgentConnectors).not.toHaveBeenCalled();
  expect(container.textContent).toContain("agents.connectors.draftAdded");
});

it("disables draft changes while the Agent is being saved", async () => {
  await mountEditor({ disabled: true });
  expect(manage().disabled).toBe(true);
  expect(container.querySelector<HTMLButtonElement>('[aria-label="agents.connectors.removeNamed:docs"]')?.disabled).toBe(true);
});
