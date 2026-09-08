/** @jest-environment jsdom */
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ApiError, getAdminConnectors, getAdminTools, getConnectorSkills, getConnectorSkillDetail, getConnectorAuthStatus, getConnectorDefinition, updateConnectorDefinition } from "@/shared/data";
import type { ConnectorSummary } from "@/shared/data";
import { I18nProvider } from "@/shared/i18n";
import { ConnectorsConsole } from "./ConnectorsConsole";

const push = { subscribe: jest.fn(() => jest.fn()) };
const blocker = { state: "unblocked" };
jest.mock("react-router-dom", () => ({ useBlocker: () => blocker }));
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ usePushTransport: () => push }));
jest.mock("./ConnectorImportModal", () => ({ ConnectorImportModal: () => null }));
jest.mock("@/shared/ui/CodeEditor", () => ({
  CodeEditor: ({ value, disabled, onChange, options, language, path, theme }: import("@/shared/ui/CodeEditor").CodeEditorProps) => React.createElement("textarea", {
    value, readOnly: disabled, "aria-label": options?.ariaLabel,
    "data-language": language, "data-path": path, "data-theme": theme,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(event.target.value),
  }),
}));
jest.mock("@/shared/data", () => ({
  ApiError: jest.requireActual("@/shared/data/api/http").ApiError,
  getAdminConnectors: jest.fn(), getAdminTools: jest.fn(), getConnectorDefinition: jest.fn(), updateConnectorDefinition: jest.fn(), importConnectorArchive: jest.fn(),
  getConnectorSkills: jest.fn(), getConnectorSkillDetail: jest.fn(),
  getConnectorAuthStatus: jest.fn(), startConnectorAuth: jest.fn(), cancelConnectorAuth: jest.fn(), logoutConnectorAuth: jest.fn(),
}));
const item: ConnectorSummary = { id: "demo", name: "Demo connector", version: "1.0", description: "Connector description", icon: "assets/icon.svg", type: "cli", auth_mode: "cli", hasCli: true, hasMcp: true, hasBin: true, skills: [], mcp: [] };
let container: HTMLDivElement;
let root: Root;
const button = (text: string) => Array.from(container.querySelectorAll("button")).find(node => node.textContent?.replace(" •", "") === text)!;
const click = async (text: string) => { expect(button(text)).toBeDefined(); await act(async () => button(text).click()); };
const detail = () => container.querySelector('nav[aria-label="连接器详情"]')!.parentElement!;
function Harness() {
  const [id, setId] = useState("demo");
  return React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false }, React.createElement(ConnectorsConsole, { routeId: id, onRouteIdChange: setId }));
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.resetAllMocks();
  push.subscribe.mockImplementation(() => jest.fn());
  jest.mocked(getAdminConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: [item] } });
  jest.mocked(getAdminTools).mockResolvedValue({ code: 0, msg: "", data: [] });
  jest.mocked(getConnectorDefinition).mockImplementation(async target => ({ code: 0, msg: "", data: { ...target, sha256: "original", content: JSON.stringify(target.file === "connector.json" ? item : target.file === "mcp.json" ? { mcpServers: { main: { type: "http", url: "https://mcp.example" } } } : { auth: "configured-cli login" }) } }));
  jest.mocked(getConnectorAuthStatus).mockImplementation(async id => ({ code: 0, msg: "", data: { connectorId: id, sessionId: "", status: "unauthorized", expiresAt: "0001-01-01T00:00:00Z" } }));
  jest.mocked(getConnectorSkills).mockResolvedValue({ code: 0, msg: "", data: { connectorId: "demo", skills: [] } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); });
const mount = async () => { await act(async () => root.render(React.createElement(Harness))); };

it("uses overview as the single manifest editor and removes the redundant detail header", async () => {
  await mount();
  expect(detail().querySelector("header")).toBeNull();
  expect(detail().querySelector("h2")).toBeNull();
  expect(detail().querySelector<HTMLInputElement>("input:not([readonly])")?.value).toBe(item.name);
  expect(detail().querySelectorAll('[aria-label="基本信息"]')).toHaveLength(1);
  expect(button("connector.json")).toBeUndefined();
  await click("配置");
  expect(button("connector.json")).toBeUndefined();
  expect(button("mcp.json")).toBeDefined();
  expect(button("cli.json")).toBeDefined();
  expect(detail().querySelector('[aria-label="基本信息"]')).toBeNull();
  expect(detail().querySelector('[aria-label="账号授权"]')).toBeNull();
  await click("cli.json");
  expect(detail().querySelector<HTMLTextAreaElement>("textarea")?.value).toContain("configured-cli login");
  await click("概览");
  expect(detail().querySelector('[aria-label="基本信息"]')).not.toBeNull();
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(1);
});

it("keeps an unsaved overview draft when switching to component configuration is canceled", async () => {
  await mount();
  await click("JSON 源码");
  const textarea = detail().querySelector<HTMLTextAreaElement>('textarea[aria-label="JSON 配置"]')!;
  const changed = JSON.stringify({ ...item, description: "Unsaved description" });
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, changed);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  jest.spyOn(window, "confirm").mockReturnValue(false);
  await click("配置");
  expect(window.confirm).toHaveBeenCalledTimes(1);
  expect(button("概览").getAttribute("aria-current")).toBe("page");
  expect(textarea.value).toBe(changed);
  expect(getConnectorDefinition).toHaveBeenCalledTimes(1);
  jest.mocked(window.confirm).mockReturnValue(true);
  await click("配置");
  expect(button("配置").getAttribute("aria-current")).toBe("page");
});

it("refreshes list authorization and MCP data without overwriting the manifest draft", async () => {
  await mount();
  const input = detail().querySelector<HTMLInputElement>("input:not([readonly])")!;
  const before = "Unsaved manifest name";
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, before);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce({ code: 0, msg: "", data: { connectorId: item.id, sessionId: "", status: "authorized", expiresAt: "0001-01-01T00:00:00Z" } });
  await click("重新检查状态");
  expect(container.querySelector("aside")?.textContent).toContain("已授权");
  expect(getAdminConnectors).toHaveBeenCalledTimes(2);
  expect(getAdminTools).toHaveBeenCalledTimes(2);
  expect(getConnectorDefinition).toHaveBeenCalledTimes(1);
  expect(detail().querySelector<HTMLInputElement>("input:not([readonly])")?.value).toBe(before);
});

it("does not report installed connectors as missing when platform authentication fails", async () => {
  jest.mocked(getAdminConnectors).mockRejectedValueOnce(new ApiError("unauthorized", { status: 401 }));
  await mount();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Platform 身份认证未通过");
  expect(container.textContent).not.toContain("找不到连接器");
  expect(container.textContent).not.toContain("已安装 0 个连接器");
});

it("saves overview fields to connector.json with the current base hash", async () => {
  await mount();
  const name = detail().querySelector<HTMLInputElement>("input:not([readonly])")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Renamed connector");
    name.dispatchEvent(new Event("input", { bubbles: true }));
  });
  jest.mocked(updateConnectorDefinition).mockImplementation(async params => ({ code: 0, msg: "", data: { ...params, sha256: "saved" } }));
  await click("保存配置");
  expect(updateConnectorDefinition).toHaveBeenCalledWith(expect.objectContaining({ id: "demo", file: "connector.json", baseSha256: "original", content: expect.stringContaining("Renamed connector") }));
  expect(JSON.parse(jest.mocked(updateConnectorDefinition).mock.calls[0][0].content).icon).toBe(item.icon);
  expect(button("概览").textContent).toBe("概览");
});

it("keeps built-in fields and the Monaco JSON source read-only", async () => {
  jest.mocked(getAdminConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: [{ ...item, builtin: true, readOnly: true }] } });
  await mount();
  const basics = detail().querySelector('[aria-label="基本信息"]')!;
  const fields = Array.from(basics.querySelectorAll("input"));
  expect(fields.map(input => input.value)).toEqual([item.id, "CLI", "cli", item.name, item.version]);
  expect(fields.every(input => input.readOnly)).toBe(true);
  expect(basics.querySelector("textarea")?.readOnly).toBe(true);
  expect(basics.textContent).toContain("只读");
  expect(basics.textContent).not.toContain("可在 JSON 源码中编辑");
  expect(button("保存配置")).toBeUndefined();
  await click("JSON 源码");
  const editor = basics.querySelector("textarea")!;
  expect(editor.value).toContain(item.id);
  expect(editor.readOnly).toBe(true);
  expect(editor.dataset.language).toBe("json");
  expect(editor.dataset.path).toBe("connector:///demo/connector.json");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(editor, "{}");
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("基本信息");
  expect(basics.querySelectorAll("input")[3].value).toBe(item.name);
  expect(updateConnectorDefinition).not.toHaveBeenCalled();
});

it("edits and saves CLI JSON through the Monaco editor without changing the file identity", async () => {
  await mount();
  await click("配置");
  await click("cli.json");
  const editor = detail().querySelector<HTMLTextAreaElement>('textarea[aria-label="JSON 配置"]')!;
  expect(editor.readOnly).toBe(false);
  expect(editor.dataset.language).toBe("json");
  expect(editor.dataset.path).toBe("connector:///demo/cli.json");
  const changed = JSON.stringify({ auth: "updated-cli login" }, null, 2);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(editor, changed);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  });
  jest.mocked(updateConnectorDefinition).mockImplementation(async params => ({ code: 0, msg: "", data: { ...params, sha256: "saved" } }));
  await click("保存配置");
  expect(updateConnectorDefinition).toHaveBeenCalledWith({ id: item.id, file: "cli.json", content: changed, baseSha256: "original" });
});


it("shows three tabs, moves component details into configuration, and keeps skill browsing read-only", async () => {
  const skill = { name: "demo-guide", description: "Read connector records", version: "2.0.0", path: "skills/demo-guide/SKILL.md", size: 120, updatedAt: 0 };
  jest.mocked(getAdminConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: [{ ...item, skills: [skill.name], mcp: [{ serverKey: "demo", status: "unmounted", toolCount: 0 }] }] } });
  jest.mocked(getConnectorSkills).mockResolvedValue({ code: 0, msg: "", data: { connectorId: "demo", skills: [skill] } });
  jest.mocked(getConnectorSkillDetail).mockResolvedValue({ code: 0, msg: "", data: { connectorId: "demo", skill, content: "---\nname: demo-guide\ndescription: Read connector records\n---\n# Complete guide\nQuery records with the CLI.", sha256: "skill-hash" } });
  await mount();
  expect(detail().textContent).not.toContain("MCP 组件与工具");
  expect(getConnectorSkills).not.toHaveBeenCalled();
  await click("配置");
  expect(detail().textContent).toContain("MCP 组件与工具");
  expect(detail().textContent).toContain("未挂载");
  await click("技能1");
  expect(getConnectorSkills).toHaveBeenCalledWith("demo");
  expect(getConnectorSkillDetail).toHaveBeenCalledWith("demo", "demo-guide");
  expect(detail().textContent).toContain("Read connector records");
  expect(detail().textContent).toContain("2.0.0");
  expect(detail().textContent).toContain("Complete guide");
  expect(button("保存配置")).toBeUndefined();
  await click("源码");
  expect(detail().querySelector("pre")?.textContent).toContain("name: demo-guide");
});

it("preserves a manifest draft while inspecting the empty skills tab", async () => {
  await mount();
  const input = detail().querySelector<HTMLInputElement>("input:not([readonly])")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Draft name");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("技能0");
  expect(detail().textContent).toContain("此连接器未附带技能");
  await click("概览");
  expect(detail().querySelector<HTMLInputElement>("input:not([readonly])")?.value).toBe("Draft name");
  expect(getConnectorDefinition).toHaveBeenCalledTimes(1);
});

it("uses compact name/version and status/type rows without exposing the connector id in the list", async () => {
  await mount();
  const listItem = container.querySelector('aside button[aria-current="true"]')!;
  expect(listItem.querySelector("code")).toBeNull();
  const heading = listItem.querySelector("strong")!.parentElement!;
  expect(heading.querySelector("strong")?.textContent).toBe(item.name);
  expect(heading.lastElementChild?.textContent).toBe("v1.0");
  const footer = listItem.lastElementChild!;
  expect(footer.firstElementChild?.textContent).toBe("未登录");
  expect(footer.lastElementChild?.textContent).toBe("CLIMCP");
  expect(container.querySelector('aside button[aria-label="导入"]')?.getAttribute("title")).toBe("导入");
  expect(container.textContent).not.toContain("可通过 ZIP 导入外部连接器");
});


it("checks unselected connectors independently while the list and configuration remain usable", async () => {
  const other = { ...item, id: "other", name: "Other connector" };
  jest.mocked(getAdminConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: [item, other] } });
  let resolveSlow!: (value: any) => void;
  jest.mocked(getConnectorAuthStatus).mockImplementation(id => id === "demo" ? new Promise(resolve => { resolveSlow = resolve; }) : Promise.resolve({ code: 0, msg: "", data: { connectorId: id, sessionId: "", status: "authorized", expiresAt: "" } }));
  await mount();
  const rows = () => Array.from(container.querySelectorAll("aside button")).filter(node => node.querySelector("strong"));
  expect(rows()[0].textContent).toContain("检查中");
  expect(rows()[1].textContent).toContain("已授权");
  expect(container.textContent).not.toContain("尚未确认");
  expect(detail().querySelector<HTMLInputElement>("input:not([readonly])")?.value).toBe(item.name);
  await click("配置");
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(2);
  await act(async () => resolveSlow({ code: 0, msg: "", data: { connectorId: "demo", sessionId: "", status: "unauthorized", expiresAt: "" } }));
  expect(rows()[0].textContent).toContain("未登录");
  expect(rows()[1].textContent).toContain("已授权");
});

it("rechecks even the selected item without hiding its known status or duplicating requests", async () => {
  await mount();
  const row = container.querySelector<HTMLButtonElement>('aside button[aria-current="true"]')!;
  let resolveCheck!: (value: any) => void;
  jest.mocked(getConnectorAuthStatus).mockImplementationOnce(() => new Promise(resolve => { resolveCheck = resolve; }));
  await act(async () => { row.click(); row.click(); });
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(2);
  expect(row.textContent).toContain("未登录");
  expect(row.textContent).not.toContain("尚未确认");
  expect(button("重新检查状态")).toBeUndefined();
  await act(async () => resolveCheck({ code: 0, msg: "", data: { connectorId: "demo", sessionId: "", status: "authorized", expiresAt: "" } }));
  expect(row.textContent).toContain("已授权");
  expect(detail().querySelector('[role="status"]')?.textContent).toBe("已授权");
});

it("keeps the last known status on errors and shares retries between list and details", async () => {
  await mount();
  const row = container.querySelector<HTMLButtonElement>('aside button[aria-current="true"]')!;
  jest.mocked(getConnectorAuthStatus).mockRejectedValueOnce(new Error("network offline"));
  await act(async () => row.click());
  expect(row.textContent).toContain("未登录 · 检查失败");
  expect(detail().querySelector('[role="alert"]')?.textContent).toContain("network offline");
  await click("重新检查状态");
  expect(row.textContent).not.toContain("检查失败");
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(3);
});

it("aborts old checks and recreates observers correctly under StrictMode", async () => {
  const signals: AbortSignal[] = [];
  jest.mocked(getConnectorAuthStatus).mockImplementation((_id, signal) => {
    signals.push(signal!);
    return new Promise(() => {});
  });
  await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Harness))));
  expect(signals.filter(signal => !signal.aborted)).toHaveLength(1);
  await act(async () => root.render(null));
  expect(signals.every(signal => signal.aborted)).toBe(true);
});
