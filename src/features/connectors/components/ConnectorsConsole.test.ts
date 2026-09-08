/** @jest-environment jsdom */
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ApiError, getAdminConnectors, getAdminTools, getConnectorAuthStatus, getConnectorDefinition, updateConnectorDefinition } from "@/shared/data";
import type { ConnectorSummary } from "@/shared/data";
import { I18nProvider } from "@/shared/i18n";
import { ConnectorsConsole } from "./ConnectorsConsole";

const push = { subscribe: jest.fn(() => jest.fn()) };
const blocker = { state: "unblocked" };
jest.mock("react-router-dom", () => ({ useBlocker: () => blocker }));
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ usePushTransport: () => push }));
jest.mock("./ConnectorImportModal", () => ({ ConnectorImportModal: () => null }));
jest.mock("@/shared/data", () => ({
  ApiError: jest.requireActual("@/shared/data/api/http").ApiError,
  getAdminConnectors: jest.fn(), getAdminTools: jest.fn(), getConnectorDefinition: jest.fn(), updateConnectorDefinition: jest.fn(), importConnectorArchive: jest.fn(),
  getConnectorAuthStatus: jest.fn(), startConnectorAuth: jest.fn(), cancelConnectorAuth: jest.fn(), logoutConnectorAuth: jest.fn(),
}));
const item: ConnectorSummary = { id: "demo", name: "Demo connector", version: "1.0", description: "Connector description", type: "cli", auth_mode: "cli", hasCli: true, hasMcp: true, hasBin: true, skills: [], mcp: [] };
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
  jest.mocked(getConnectorAuthStatus).mockResolvedValue({ code: 0, msg: "", data: { connectorId: item.id, sessionId: "", status: "unauthorized", expiresAt: "0001-01-01T00:00:00Z" } });
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
  expect(detail().querySelector<HTMLInputElement>("input")?.value).toBe(item.name);
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
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(2);
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
  const input = detail().querySelector<HTMLInputElement>("input")!;
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
  expect(detail().querySelector<HTMLInputElement>("input")?.value).toBe(before);
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
  const name = detail().querySelector<HTMLInputElement>("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Renamed connector");
    name.dispatchEvent(new Event("input", { bubbles: true }));
  });
  jest.mocked(updateConnectorDefinition).mockImplementation(async params => ({ code: 0, msg: "", data: { ...params, sha256: "saved" } }));
  await click("保存配置");
  expect(updateConnectorDefinition).toHaveBeenCalledWith(expect.objectContaining({ id: "demo", file: "connector.json", baseSha256: "original", content: expect.stringContaining("Renamed connector") }));
  expect(button("概览").textContent).toBe("概览");
});
