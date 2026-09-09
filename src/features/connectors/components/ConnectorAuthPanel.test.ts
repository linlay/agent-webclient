/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ApiError, cancelConnectorAuth, getConnectorAuthStatus, logoutConnectorAuth, startConnectorAuth } from "@/shared/data";
import type { ConnectorAuthSession, ConnectorSummary } from "@/shared/data";
import { I18nProvider } from "@/shared/i18n";
import { ConnectorAuthPanel } from "./ConnectorAuthPanel";
import { ConnectorComponents } from "./ConnectorComponents";

jest.mock("@/shared/data", () => ({
  ApiError: jest.requireActual("@/shared/data/api/http").ApiError,
  getConnectorAuthStatus: jest.fn(), startConnectorAuth: jest.fn(), cancelConnectorAuth: jest.fn(), logoutConnectorAuth: jest.fn(),
}));
const item: ConnectorSummary = { id: "configured-cli", name: "Configured CLI", version: "1.0", type: "cli", auth_mode: "cli", hasCli: true, hasMcp: false, hasBin: true, skills: [] };
const onConfigure = jest.fn();
const onCredentialsChange = jest.fn();
const onStatusChange = jest.fn();
let root: Root;
let container: HTMLDivElement;
const response = (status: ConnectorAuthSession["status"], values: Partial<ConnectorAuthSession> = {}) => ({ code: 0, msg: "", data: { connectorId: item.id, sessionId: "session-1", expiresAt: new Date(Date.now() + 900_000).toISOString(), status, ...values } });
async function mount(connector = item, locale: "zh-CN" | "en-US" = "zh-CN") {
  await act(async () => root.render(React.createElement(I18nProvider, { locale, persistLocale: false }, React.createElement(React.Fragment, null,
    React.createElement(ConnectorAuthPanel, { key: `${connector.id}/${connector.auth_mode}`, item: connector, onConfigure, onCredentialsChange, onStatusChange }),
    React.createElement(ConnectorComponents, { item: connector, tools: [] }),
  ))));
}
const button = (text: string) => Array.from(container.querySelectorAll("button")).find(node => node.textContent === text)!;
const click = async (text: string) => { expect(button(text)).toBeDefined(); await act(async () => button(text).click()); };
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  jest.resetAllMocks();
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response("unauthorized"));
  jest.mocked(startConnectorAuth).mockResolvedValue(response("pending", { authorizationUrl: "https://official.example/authorize?state=test" }));
  jest.mocked(cancelConnectorAuth).mockResolvedValue({ code: 0, msg: "", data: { id: item.id, status: "canceled" } });
  jest.mocked(logoutConnectorAuth).mockResolvedValue({ code: 0, msg: "", data: { id: item.id, status: "unauthorized" } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.useRealTimers(); jest.restoreAllMocks(); });

it.each(["cli", null] as const)("offers a safe manual link for auth_mode=%s and only displays success after server confirmation", async mode => {
  const open = jest.spyOn(window, "open").mockReturnValue(null);
  await mount({ ...item, auth_mode: mode });
  await click("登录");
  expect(container.textContent).toContain("等待扫码 / 授权");
  const link = container.querySelector<HTMLAnchorElement>('a[target="_blank"]')!;
  expect(link.textContent).toContain("打开授权页面");
  expect(link.href).toBe("https://official.example/authorize?state=test");
  expect(link.rel).toBe("noopener noreferrer");
  expect(link.getAttribute("referrerpolicy")).toBe("no-referrer");
  expect(open).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain("服务端已确认账号授权成功");
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("authorized"));
  await act(async () => jest.advanceTimersByTime(2_000));
  expect(container.querySelector("a")).toBeNull();
  expect(container.textContent).toContain("已授权");
  expect(button("退出登录")).toBeDefined();
  expect(onCredentialsChange).toHaveBeenCalledTimes(1);
});

it("cancels and retries within the existing detail panel", async () => {
  await mount();
  await click("登录");
  await click("取消登录");
  expect(container.textContent).toContain("已取消");
  expect(container.querySelector("a")).toBeNull();
  expect(cancelConnectorAuth).toHaveBeenCalledTimes(1);
  await click("重新登录");
  expect(startConnectorAuth).toHaveBeenCalledTimes(2);
  expect(container.querySelector("a")).not.toBeNull();
});

it("requires explicit deployment-wide logout confirmation and then displays signed out", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("authorized"));
  await mount();
  await click("退出登录");
  expect(container.textContent).toContain("影响使用此账号的智能体");
  expect(logoutConnectorAuth).not.toHaveBeenCalled();
  await click("保留登录");
  expect(logoutConnectorAuth).not.toHaveBeenCalled();
  await click("退出登录");
  await click("确认退出登录");
  expect(logoutConnectorAuth).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("未登录");
});

it("shows request failures and can recover without remounting the panel", async () => {
  jest.mocked(getConnectorAuthStatus).mockRejectedValueOnce(new ApiError("HTTP 404", { status: 404 }));
  await mount();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Platform 已更新到支持连接器授权的版本");
  expect(button("登录")).toBeUndefined();
  await click("重新检查状态");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(button("登录")).toBeDefined();
});

it("blocks unsafe links and offers cancellation instead of navigating", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("pending", { authorizationUrl: "javascript:alert(document.cookie)" }));
  await mount();
  expect(container.querySelector("a")).toBeNull();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("授权链接不安全");
  expect(button("取消登录")).toBeDefined();
});

it("distinguishes MCP tool availability from OAuth login in English", async () => {
  const mcp: ConnectorSummary = { ...item, type: "mcp", auth_mode: "oauth", hasCli: false, hasMcp: true, mcp: [{ serverKey: "demo.main", status: "unavailable", toolCount: 0 }] };
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("authorized"));
  await mount(mcp, "en-US");
  expect(container.textContent).toContain("Authorized");
  expect(container.textContent).toContain("Unavailable");
  expect(container.textContent).toContain("same machine running Platform");
  expect(container.textContent).toContain("checked separately");
  expect(button("Sign out")).toBeDefined();
});

it("routes token mode to existing configuration and never presents interactive login", async () => {
  await mount({ ...item, auth_mode: "token" });
  expect(container.textContent).toContain("凭据配置");
  await click("配置");
  expect(onConfigure).toHaveBeenCalledTimes(1);
  expect(getConnectorAuthStatus).not.toHaveBeenCalled();
  expect(button("登录")).toBeUndefined();
});

it("shows the none mode without querying authorization", async () => {
  await mount({ ...item, auth_mode: "none" });
  expect(container.textContent).toContain("无需授权");
  expect(getConnectorAuthStatus).not.toHaveBeenCalled();
  expect(button("登录")).toBeUndefined();
});

it.each(["zh-CN", "en-US"] as const)("displays delegated authentication without an endless spinner or login action in %s", async locale => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response("delegated"));
  await mount({ ...item, auth_mode: null }, locale);
  expect(container.textContent).toContain(locale === "zh-CN" ? "由连接器管理" : "Managed by connector");
  expect(container.textContent).not.toContain(locale === "zh-CN" ? "检查中" : "Checking");
  expect(button(locale === "zh-CN" ? "登录" : "Sign in")).toBeUndefined();
  expect(button(locale === "zh-CN" ? "重新检查状态" : "Check status again")).toBeDefined();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it.each(["unauthorized", "authorized"] as const)("shows Desktop identity %s with refresh and Desktop guidance", async status => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(response(status));
  await mount({ ...item, auth_mode: "oneid-token" });
  expect(container.textContent).toContain(status === "authorized" ? "已授权" : "未登录");
  expect(container.textContent).toContain("请在 Desktop 中登录或退出");
  expect(button("登录")).toBeUndefined();
  expect(button("退出登录")).toBeUndefined();
  await click("重新检查状态");
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(2);
});

it.each([null, "oneid-token"] as const)("shows and recovers from canonical auth_mode=%s check errors", async mode => {
  jest.mocked(getConnectorAuthStatus).mockRejectedValueOnce(new ApiError("unauthorized", { status: 401 }));
  await mount({ ...item, auth_mode: mode });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Platform 身份认证未通过");
  expect(container.textContent).not.toContain("正在获取授权状态");
  await click("重新检查状态");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("未登录");
});

it("removes expired links while retaining an explicit retry action", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValueOnce(response("pending", { authorizationUrl: "https://official.example/login", expiresAt: new Date(Date.now() + 1_000).toISOString() }));
  await mount();
  await act(async () => jest.advanceTimersByTime(1_000));
  expect(container.textContent).toContain("登录已过期");
  expect(container.querySelector("a")).toBeNull();
  expect(button("重新登录")).toBeDefined();
});
