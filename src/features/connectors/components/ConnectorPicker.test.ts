/** @jest-environment jsdom */
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fetchConnectorIcon, getConnectors, getConnectorAuthStatus, startConnectorAuth, logoutConnectorAuth } from "@/shared/data";
import type { ConnectorSummary } from "@/shared/data";
import { ConnectorPicker } from "./ConnectorPicker";
import { decodePlatformApiError } from "@/features/transport/lib/platformFrameCodec";

jest.mock("@/shared/data", () => ({
  ApiError: jest.requireActual("@/shared/data/api/http").ApiError,
  getConnectors: jest.fn(), getConnectorAuthStatus: jest.fn(), startConnectorAuth: jest.fn(), logoutConnectorAuth: jest.fn(),
  fetchConnectorIcon: jest.fn(),
}));
const push = { subscribe: jest.fn(() => jest.fn()) };
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ usePushTransport: () => push }));
jest.mock("@/shared/i18n", () => ({ t: (key: string) => key, useI18n: () => ({ t: (key: string, params?: Record<string, string>) => params && key === "composer.addMenu.connectors.selectionConflict" ? `${key}: ${params.name}: ${params.conflicts}` : key }) }));
jest.mock("@/shared/ui/MaterialIcon", () => ({ MaterialIcon: () => null }));
jest.mock("@/shared/ui/UiButton", () => ({ UiButton: ({ children, variant: _variant, size: _size, ...props }: any) => React.createElement("button", props, children) }));
const mockMessageError = jest.fn();
const mockMessageApi = { error: mockMessageError };
jest.mock("antd", () => ({
  message: { useMessage: () => [mockMessageApi, null] },
  Input: React.forwardRef(({ prefix: _prefix, variant: _variant, ...props }: any, ref: any) => React.createElement("input", { ...props, ref })),
  Spin: () => React.createElement("span", null, "loading"),
  Switch: ({ checked, disabled, onChange, "aria-label": label }: any) => React.createElement("button", { role: "switch", "aria-checked": checked, "aria-label": label, disabled, onClick: () => onChange(!checked) }),
}));

const connector = (id: string, name: string, mode: ConnectorSummary["auth_mode"] = "none"): ConnectorSummary => ({ id, name, version: "1", type: "cli", auth_mode: mode, hasCli: true, hasMcp: false, hasBin: false, skills: [] });
let root: Root;
let container: HTMLDivElement;
const onSelectionChange = jest.fn();
function Harness({ agentKey = "zenmi", search = "", selectionDisabled = false, initialIds = ["docs"], selectionError }: { agentKey?: string; search?: string; selectionDisabled?: boolean; initialIds?: string[]; selectionError?: Error }) {
  const [selectedIds, setSelectedIds] = useState(initialIds);
  return React.createElement(ConnectorPicker, { agentKey, search, onSearchChange: jest.fn(), selectedIds, selectionDisabled, selectionError,
    onSelectionChange: (item, selected) => { onSelectionChange(item.id, selected); setSelectedIds(ids => selected ? [...ids, item.id] : ids.filter(id => id !== item.id)); } });
}
const mount = async (props = {}) => { await act(async () => root.render(React.createElement(Harness, props))); };

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(getConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: [connector("docs", "文档"), connector("login", "会议", "oauth")] } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.useRealTimers(); });

it("displays a package brand icon through the authenticated Blob loader", async () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => "blob:picker-brand");
  URL.revokeObjectURL = jest.fn();
  try {
    const iconUrl = "/api/connectors/icon?id=wecom&v=hash";
    jest.mocked(getConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: [{ ...connector("wecom", "企业微信"), iconUrl }] } });
    jest.mocked(fetchConnectorIcon).mockResolvedValue(new Blob(["icon"], { type: "image/png" }));
    await mount();
    expect(fetchConnectorIcon).toHaveBeenCalledWith(iconUrl, { signal: expect.any(AbortSignal) });
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:picker-brand");
  } finally {
    await act(async () => root.render(null));
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});

it("filters by name/id and keeps the selected switch state when the filter is cleared", async () => {
  await mount();
  const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  await act(async () => toggle.click());
  expect(onSelectionChange).toHaveBeenCalledWith("docs", false);
  expect(logoutConnectorAuth).not.toHaveBeenCalled();
  await mount({ search: "login" });
  expect(container.textContent).not.toContain("文档");
  expect(container.textContent).toContain("会议");
  await mount({ search: "文档" });
  expect(container.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
  expect(getConnectorAuthStatus).not.toHaveBeenCalled();
});

it("ranks mounted connectors first on opening and keeps row positions and focus while switching and filtering", async () => {
  const catalog = [connector("a", "Alpha"), connector("b", "Bravo", "oauth"), connector("c", "Charlie"), connector("d", "Delta")];
  jest.mocked(getConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: catalog } });
  await mount({ initialIds: ["d", "b"] });
  const names = () => [...container.querySelectorAll('[role="switch"]')].map(toggle => toggle.parentElement?.textContent);
  expect(names()).toEqual(["Bravo", "Delta", "Alpha", "Charlie"]);
  const bravo = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
  const alpha = container.querySelectorAll<HTMLButtonElement>('[role="switch"]')[2];
  alpha.focus();
  await act(async () => alpha.click());
  expect(onSelectionChange).toHaveBeenLastCalledWith("a", true);
  expect(alpha.getAttribute("aria-checked")).toBe("true");
  expect(names()).toEqual(["Bravo", "Delta", "Alpha", "Charlie"]);
  expect(document.activeElement).toBe(alpha);
  await act(async () => bravo.click());
  expect(onSelectionChange).toHaveBeenLastCalledWith("b", false);
  expect(bravo.getAttribute("aria-checked")).toBe("false");
  expect(names()).toEqual(["Bravo", "Delta", "Alpha", "Charlie"]);
  await mount({ search: "Charlie" });
  expect(names()).toEqual(["Charlie"]);
  await mount();
  expect(names()).toEqual(["Bravo", "Delta", "Alpha", "Charlie"]);
  expect(catalog.map(item => item.id)).toEqual(["a", "b", "c", "d"]);
  expect(getConnectorAuthStatus).not.toHaveBeenCalled();
  expect(startConnectorAuth).not.toHaveBeenCalled();
  expect(logoutConnectorAuth).not.toHaveBeenCalled();
  await act(async () => root.render(null));
  await mount({ initialIds: ["d", "a"] });
  expect(names()).toEqual(["Alpha", "Delta", "Bravo", "Charlie"]);
});

it("only exposes mounting switches while filtering or enabling authenticated packages", async () => {
  await mount();
  expect(getConnectorAuthStatus).not.toHaveBeenCalled();
  await act(async () => container.querySelectorAll<HTMLButtonElement>('[role="switch"]')[1].click());
  await mount({ search: "docs" });
  await act(async () => {
    jest.advanceTimersByTime(60_000);
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await mount();
  expect(container.querySelectorAll('[role="switch"]')).toHaveLength(2);
  expect(onSelectionChange).toHaveBeenCalledWith("login", true);
  expect(container.textContent).toBe("文档会议");
  expect(container.querySelectorAll("button")).toHaveLength(2);
  expect(container.querySelector("a")).toBeNull();
  expect(getConnectorAuthStatus).not.toHaveBeenCalled();
  expect(startConnectorAuth).not.toHaveBeenCalled();
});

it("reports load failure, supports retry, and distinguishes an empty catalog", async () => {
  jest.mocked(getConnectors).mockRejectedValueOnce(new Error("offline"));
  await mount();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("composer.addMenu.connectors.loadFailed");
  jest.mocked(getConnectors).mockResolvedValueOnce({ code: 0, msg: "", data: { connectors: [] } });
  await act(async () => container.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
  expect(container.textContent).toContain("composer.addMenu.connectors.empty");
});

it("disables switches when Agent configuration selection is disabled without extra actions", async () => {
  await mount({ selectionDisabled: true, initialIds: ["login"] });
  expect(container.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled).toBe(true);
  expect(container.querySelectorAll("button")).toHaveLength(2);
  expect(getConnectorAuthStatus).not.toHaveBeenCalled();
});

it("keeps an already mounted connector switched on even when authorization is missing", async () => {
  await mount({ initialIds: ["docs", "login"] });
  const switches = container.querySelectorAll<HTMLButtonElement>('[role="switch"]');
  expect(switches).toHaveLength(2);
  expect(switches[1].getAttribute("aria-checked")).toBe("true");
  expect(container.querySelectorAll("button")).toHaveLength(2);
  expect(getConnectorAuthStatus).not.toHaveBeenCalled();
  await act(async () => switches[1].click());
  expect(onSelectionChange).toHaveBeenCalledWith("login", false);
  expect(logoutConnectorAuth).not.toHaveBeenCalled();
});

it("allows mounting builtin and delegated or identity-token packages without waiting for interactive login", async () => {
  jest.mocked(getConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: [
    { ...connector("builtin.dbx", "DBX", null), builtin: true, readOnly: true },
    connector("identity", "Identity", "oneid-token"),
  ] } });
  await mount({ initialIds: ["builtin.dbx"] });
  const switches = container.querySelectorAll<HTMLButtonElement>('[role="switch"]');
  expect(switches).toHaveLength(2);
  expect(switches[0].getAttribute("aria-checked")).toBe("true");
  expect(switches[1].getAttribute("aria-checked")).toBe("false");
  await act(async () => switches[0].click());
  expect(onSelectionChange).toHaveBeenCalledWith("builtin.dbx", false);
  expect(getConnectorAuthStatus).not.toHaveBeenCalled();
  expect(startConnectorAuth).not.toHaveBeenCalled();
  expect(logoutConnectorAuth).not.toHaveBeenCalled();
});


it("does not probe unselected catalog entries even after timers and visibility changes", async () => {
  jest.mocked(getConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors:
    Array.from({ length: 100 }, (_, i) => connector(`item-${i}`, `Item ${i}`, "oauth")),
  } });
  await mount({ initialIds: [] });
  await act(async () => {
    jest.advanceTimersByTime(60_000);
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(getConnectorAuthStatus).not.toHaveBeenCalled();
  expect(container.querySelectorAll('[role="switch"]')).toHaveLength(100);
});

it("does not change account authorization when mounting is disabled", async () => {
  await mount({ initialIds: ["login"] });
  await act(async () => container.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
  expect(onSelectionChange).toHaveBeenCalledWith("login", false);
  await act(async () => jest.advanceTimersByTime(60_000));
  expect(getConnectorAuthStatus).not.toHaveBeenCalled();
  expect(logoutConnectorAuth).not.toHaveBeenCalled();
  expect(startConnectorAuth).not.toHaveBeenCalled();
});

it("Desktop no_auth mounts and unmounts without checking or connecting",async()=>{
 jest.mocked(getConnectors).mockResolvedValue({code:0,msg:"",data:{connectors:[{...connector("desktop","Desktop","no_auth"),type:"native",hasNative:true,builtin:true,readOnly:true,hasCli:false}]}});
 await mount({initialIds:["desktop"]});
 expect(container.textContent).not.toContain("connectors.auth.checking");
 expect(container.querySelector('[role="status"]')).toBeNull();
 const toggle=container.querySelector<HTMLButtonElement>('[role="switch"]')!;
 expect(toggle.getAttribute("aria-checked")).toBe("true");
 await act(async()=>toggle.click());
 expect(onSelectionChange).toHaveBeenLastCalledWith("desktop",false);
 await act(async()=>toggle.click());
 expect(onSelectionChange).toHaveBeenLastCalledWith("desktop",true);
 await mount({initialIds:["desktop"],search:"Desktop"});
 await act(async()=>jest.advanceTimersByTime(90_000));
 expect(getConnectorAuthStatus).not.toHaveBeenCalled();
 expect(startConnectorAuth).not.toHaveBeenCalled();
 expect(container.textContent).not.toContain("connectors.auth.checking");
});

it("keeps every authentication mode compact with icons, names and switches", async () => {
  const modes: ConnectorSummary["auth_mode"][] = [null, "token", "oneid-token", "oauth", "mcp", "no_auth"];
  const items = modes.map((mode, index) => connector(`item-${index}`, `Item ${index}`, mode));
  jest.mocked(getConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: items } });
  await mount({ initialIds: items.map(item => item.id) });
  expect(container.textContent).toBe(items.map(item => item.name).join(""));
  expect(container.querySelectorAll('button[role="switch"]')).toHaveLength(items.length);
  expect(container.querySelectorAll("button")).toHaveLength(items.length);
  expect(container.querySelector("a, p, [role=dialog]")).toBeNull();
  expect(getConnectorAuthStatus).not.toHaveBeenCalled();
  expect(startConnectorAuth).not.toHaveBeenCalled();
});


it.each([false, true])("reports one-sided conflicts without changing selection even when the selected item is filtered out (reverse=%s)", async reverse => {
  const first = { ...connector("custom-first", "文档连接器"), mutuallyExclusiveWith: reverse ? ["custom-second"] : [] };
  const second = { ...connector("custom-second", "网页连接器"), mutuallyExclusiveWith: reverse ? [] : ["custom-first"] };
  jest.mocked(getConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: [first, second] } });
  await mount({ initialIds: [first.id], search: "网页" });
  const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
  expect(toggle.disabled).toBe(false);
  await act(async () => toggle.click());
  expect(onSelectionChange).not.toHaveBeenCalled();
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(mockMessageError).toHaveBeenCalledWith(expect.stringContaining("网页连接器: 文档连接器"));
  // Deselecting the old choice is always allowed and clears the local conflict.
  await mount({ search: "", initialIds: [first.id] });
  await act(async () => container.querySelectorAll<HTMLButtonElement>('[role="switch"]')[0].click());
  expect(onSelectionChange).toHaveBeenCalledWith(first.id, false);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  await act(async () => container.querySelectorAll<HTMLButtonElement>('[role="switch"]')[1].click());
  expect(onSelectionChange).toHaveBeenCalledWith(second.id, true);
});

it.each(["http", "ws"])("shows %s server conflicts when the local catalog is stale and reports other save failures", async transport => {
  const { ApiError } = jest.requireActual("@/shared/data/api/http");
  const selectionError = transport === "http"
    ? new ApiError("conflict", { status: 400, data: { error: { code: "connector_selection_conflict", connectorId: "login", conflictingConnectorIds: ["docs"] } } })
    : decodePlatformApiError({ type: "connector_selection_conflict", code: 400, msg: "conflict", data: {
      connectorId: "login", conflictingConnectorIds: ["docs"],
      error: { code: "connector_selection_conflict", message: "conflict", status: 400 },
    } });
  await mount({ selectionError });
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(mockMessageError).toHaveBeenCalledWith(expect.stringContaining("login: docs"));
  expect(mockMessageError).toHaveBeenCalledTimes(1);
  await mount({ search: "meeting", selectionError });
  expect(mockMessageError).toHaveBeenCalledTimes(1);
  const offline = new Error("Connection lost");
  await mount({ selectionError: offline });
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(mockMessageError).toHaveBeenLastCalledWith(expect.stringContaining("Connection lost"));
});


it("loads the scoped usage catalog without exposing platform preset controls", async () => {
  jest.mocked(getConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: [{ id: "docs", name: "文档", description: "查找文档" }] } });
  await mount();
  expect(getConnectors).toHaveBeenCalledWith("zenmi");
  expect(container.textContent).not.toContain("composer.addMenu.connectors.preset");
  expect(container.querySelectorAll('[role="switch"]')).toHaveLength(1);
  await mount({ search: "查找文档" });
  expect(container.textContent).toContain("文档");
  await mount({ search: "Web Control" });
  expect(container.querySelector('[role="switch"]')).toBeNull();
});
