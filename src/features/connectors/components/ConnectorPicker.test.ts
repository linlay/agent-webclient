/** @jest-environment jsdom */
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fetchConnectorIcon, getAdminConnectors, getConnectorAuthStatus, startConnectorAuth, logoutConnectorAuth } from "@/shared/data";
import type { ConnectorSummary } from "@/shared/data";
import { ConnectorPicker } from "./ConnectorPicker";

jest.mock("@/shared/data", () => ({
  ApiError: jest.requireActual("@/shared/data/api/http").ApiError,
  getAdminConnectors: jest.fn(), getConnectorAuthStatus: jest.fn(), startConnectorAuth: jest.fn(), logoutConnectorAuth: jest.fn(),
  fetchConnectorIcon: jest.fn(),
}));
const push = { subscribe: jest.fn(() => jest.fn()) };
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ usePushTransport: () => push }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/shared/ui/MaterialIcon", () => ({ MaterialIcon: () => null }));
jest.mock("@/shared/ui/UiButton", () => ({ UiButton: ({ children, variant: _variant, size: _size, ...props }: any) => React.createElement("button", props, children) }));
jest.mock("antd", () => ({
  Input: React.forwardRef(({ prefix: _prefix, variant: _variant, ...props }: any, ref: any) => React.createElement("input", { ...props, ref })),
  Spin: () => React.createElement("span", null, "loading"),
  Switch: ({ checked, disabled, onChange, "aria-label": label }: any) => React.createElement("button", { role: "switch", "aria-checked": checked, "aria-label": label, disabled, onClick: () => onChange(!checked) }),
}));

const connector = (id: string, name: string, mode: ConnectorSummary["auth_mode"] = "none"): ConnectorSummary => ({ id, name, version: "1", type: "cli", auth_mode: mode, hasCli: true, hasMcp: false, hasBin: false, skills: [] });
const session = (status: string, extra = {}) => ({ code: 0, data: { connectorId: "login", sessionId: "1", expiresAt: new Date(Date.now() + 90_000).toISOString(), status, ...extra } });
let root: Root;
let container: HTMLDivElement;
const onSelectionChange = jest.fn();
function Harness({ search = "", selectionDisabled = false, initialIds = ["docs"] }: { search?: string; selectionDisabled?: boolean; initialIds?: string[] }) {
  const [selectedIds, setSelectedIds] = useState(initialIds);
  return React.createElement(ConnectorPicker, { search, onSearchChange: jest.fn(), selectedIds, selectionDisabled,
    onSelectionChange: (item, selected) => { onSelectionChange(item.id, selected); setSelectedIds(ids => selected ? [...ids, item.id] : ids.filter(id => id !== item.id)); } });
}
const mount = async (props = {}) => { await act(async () => root.render(React.createElement(Harness, props))); };

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(getAdminConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: [connector("docs", "文档"), connector("login", "会议", "oauth")] } });
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(session("unauthorized") as any);
  jest.mocked(startConnectorAuth).mockResolvedValue(session("preparing") as any);
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
    jest.mocked(getAdminConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: [{ ...connector("wecom", "企业微信"), iconUrl }] } });
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
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(1);
});

it("connects once, keeps polling while filtered out, and exposes selection only after authorization", async () => {
  await mount();
  const connect = container.querySelector<HTMLButtonElement>('[aria-label="composer.addMenu.connectors.connectNamed"]')!;
  await act(async () => { connect.click(); connect.click(); });
  expect(startConnectorAuth).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("composer.addMenu.connectors.connecting");
  await mount({ search: "docs" });
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(session("authorized") as any);
  await act(async () => jest.advanceTimersByTime(2_000));
  await mount();
  expect(container.querySelectorAll('[role="switch"]')).toHaveLength(2);
  expect(onSelectionChange).not.toHaveBeenCalled();
});

it("only exposes safe authorization links", async () => {
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(session("pending", { authorizationUrl: "javascript:alert(1)" }) as any);
  await mount();
  expect(container.querySelector("a")).toBeNull();
  jest.mocked(getConnectorAuthStatus).mockResolvedValue(session("pending", { authorizationUrl: "https://example.com/authorize" }) as any);
  await act(async () => jest.advanceTimersByTime(2_000));
  expect(container.querySelector("a")?.getAttribute("href")).toBe("https://example.com/authorize");
  expect(container.querySelector("a")?.getAttribute("rel")).toBe("noopener noreferrer");
});

it("reports load failure, supports retry, and distinguishes an empty catalog", async () => {
  jest.mocked(getAdminConnectors).mockRejectedValueOnce(new Error("offline"));
  await mount();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("composer.addMenu.connectors.loadFailed");
  jest.mocked(getAdminConnectors).mockResolvedValueOnce({ code: 0, msg: "", data: { connectors: [] } });
  await act(async () => container.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
  expect(container.textContent).toContain("composer.addMenu.connectors.empty");
});

it("keeps login available when only Agent configuration selection is disabled", async () => {
  await mount({ selectionDisabled: true });
  expect(container.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled).toBe(true);
  expect(container.querySelector<HTMLButtonElement>('[aria-label="composer.addMenu.connectors.connectNamed"]')?.disabled).toBe(false);
});

it("keeps an already mounted connector switched on even when authorization is missing", async () => {
  await mount({ initialIds: ["docs", "login"] });
  const switches = container.querySelectorAll<HTMLButtonElement>('[role="switch"]');
  expect(switches).toHaveLength(2);
  expect(switches[1].getAttribute("aria-checked")).toBe("true");
  expect(container.querySelector('[aria-label="composer.addMenu.connectors.connectNamed"]')).not.toBeNull();
  await act(async () => switches[1].click());
  expect(onSelectionChange).toHaveBeenCalledWith("login", false);
  expect(logoutConnectorAuth).not.toHaveBeenCalled();
});

it("allows mounting builtin and delegated or identity-token packages without waiting for interactive login", async () => {
  jest.mocked(getConnectorAuthStatus).mockReturnValue(new Promise(() => {}));
  jest.mocked(getAdminConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: [
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
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(2);
  expect(startConnectorAuth).not.toHaveBeenCalled();
  expect(logoutConnectorAuth).not.toHaveBeenCalled();
});
