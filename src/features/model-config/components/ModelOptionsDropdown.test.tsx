/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConfigProvider } from "antd";
import { ModelOptionsDropdown } from "./ModelOptionsDropdown";
import { buildModelMenuItems } from "./ModelMenuPresenter";

jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key === "composer.addMenu.back" ? "Back" : key }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
const select = jest.fn();
const refresh = jest.fn();
const openChange = jest.fn();
const items = () => buildModelMenuItems({
  models: [{ key: "a", name: "Model A" }, { key: "b", name: "Model B with a long provider name" }],
  reasoningEfforts: [{ key: "HIGH", label: "High" }, { key: "MEDIUM", label: "Medium" }],
  modelOverride: { key: "a", reasoningEffort: "HIGH" }, selectedModelLabel: "Model A",
  modelListAction: { label: "Refresh models", onTrigger: refresh }, status: "loaded", t: key => key,
});
beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState({}, "", "/mobile");
  window.matchMedia = jest.fn().mockImplementation(() => ({ matches: false, addListener: jest.fn(), removeListener: jest.fn() }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); window.history.replaceState({}, "", "/"); });
async function open() {
  await act(async () => root.render(<ConfigProvider theme={{ token: { motion: false } }}>
    <ModelOptionsDropdown menu={{ items: items(), onClick: select }} onOpenChange={openChange} trigger={["click"]}>
      <button data-testid="model-trigger">Models</button>
    </ModelOptionsDropdown>
  </ConfigProvider>));
  await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
}
function item(text: string) {
  return [...document.querySelectorAll<HTMLElement>('button[role="menuitem"], .ant-dropdown-menu-submenu-title')].find(node => node.textContent?.includes(text))!;
}
it("navigates models in the same pane, retains refresh and back, and selects without a sideways popup", async () => {
  await open();
  await act(async () => item("Model A").click());
  expect(select).not.toHaveBeenCalled();
  expect(document.querySelector(".ant-menu-submenu-popup")).toBeNull();
  expect(item("Model B")).toBeDefined();
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Refresh models"]')!.click());
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(select).not.toHaveBeenCalled();
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Back")!.click());
  expect(item("High")).toBeDefined();
  await act(async () => item("Model A").click());
  await act(async () => item("Model B").click());
  expect(select).toHaveBeenCalledWith(expect.objectContaining({ key: "model:b" }));
  expect(openChange).toHaveBeenLastCalledWith(false, { source: "menu" });
});
it("renders the mobile model pane inside the shared headerless bottom sheet", async () => {
  await open();
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog).not.toBeNull();
  // 面板本身不画标题栏：关闭靠遮罩、Esc 与下拉手势。
  expect(document.querySelector(".ant-drawer-header")).toBeNull();
  expect(document.querySelector(".ant-drawer-title")).toBeNull();
  const labelledBy = dialog.getAttribute("aria-labelledby");
  expect(labelledBy).toBeTruthy();
  expect(document.getElementById(labelledBy!)?.textContent).toBe("composer.query.model.title");
});

it("keeps reasoning choices directly selectable in mobile", async () => {
  await open();
  await act(async () => item("High").click());
  expect(select).toHaveBeenCalledWith(expect.objectContaining({ key: "reasoning:HIGH" }));
});
it("leaves the original submenu behavior on non-mobile routes", async () => {
  window.history.replaceState({}, "", "/");
  await open();
  expect(document.querySelector(".ant-dropdown-menu-submenu-title")).not.toBeNull();
  expect(document.querySelector(".ant-menu")).toBeNull();
});
