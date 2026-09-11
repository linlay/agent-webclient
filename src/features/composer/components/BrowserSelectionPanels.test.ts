/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConfigProvider } from "antd";
import type { SelectionExplanationState } from "@/features/composer/hooks/useDesktopSelectionActions";
import { BrowserSelectionPanels } from "./BrowserSelectionPanels";

let mockDesktopMode = false;
let mockPathname = "/agent/demo";
let mockState: { chatId: string; rightSidebarOpen: boolean; rightSidebarOpenTab: string };
const mockDispatch = jest.fn();
const mockGetSession = jest.fn();
const mockBtwTab = jest.fn();
const mockExplainSurface = jest.fn();
let mockSurfaceSequence = 0;

jest.mock("react-router-dom", () => ({ useLocation: () => ({ pathname: mockPathname }) }));
jest.mock("@/app/state/AppContext", () => ({ useAppState: () => mockState, useAppDispatch: () => mockDispatch }));
jest.mock("@/features/btw/components/BtwProvider", () => ({ useOptionalBTW: () => ({ getSession: mockGetSession }) }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/shared/utils/routing", () => ({ isDesktopAppMode: () => mockDesktopMode }));
jest.mock("@/features/btw/components/BtwTab", () => {
  const React = require("react");
  return { BtwTab: () => {
    mockBtwTab();
    return React.createElement("div", { "data-testid": "btw-tab" }, "Existing BTW session");
  } };
});
jest.mock("@/features/btw/components/SelectionExplainSurface", () => {
  const React = require("react");
  return { SelectionExplainSurface: (props: { chatId: string; runId: string; embedded?: boolean }) => {
    mockExplainSurface(props);
    const [instance] = React.useState(() => ++mockSurfaceSequence);
    return React.createElement("div", { "data-testid": "explain-surface", "data-chat": props.chatId,
      "data-run": props.runId, "data-embedded": String(props.embedded), "data-instance": instance });
  } };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const pending: SelectionExplanationState = { requestId: "explain-a", chatId: "chat-a", status: "pending" };
const ready: SelectionExplanationState = { ...pending, status: "ready", runId: "run-a" };
const failure: SelectionExplanationState = { ...pending, status: "error", message: "The selected Chat is unavailable for this side question." };
let root: Root;
let container: HTMLDivElement;
let explanation: SelectionExplanationState | null;
const onCloseExplanation = jest.fn();

async function render(next = explanation) {
  explanation = next;
  await act(async () => root.render(React.createElement(ConfigProvider, { theme: { token: { motion: false } } },
    React.createElement(BrowserSelectionPanels, { explanation, onCloseExplanation }))));
}

const find = (selector: string) => document.body.querySelector<HTMLElement>(selector);
const all = (selector: string) => document.body.querySelectorAll(selector);

beforeEach(() => {
  jest.clearAllMocks();
  mockDesktopMode = false;
  mockPathname = "/agent/demo";
  mockSurfaceSequence = 0;
  mockState = { chatId: "chat-a", rightSidebarOpen: false, rightSidebarOpenTab: "btw" };
  mockGetSession.mockReturnValue({ parentChatId: "chat-a", draft: "unfinished side question" });
  explanation = null;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: jest.fn(() => ({
    matches: false, addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  })) });
  // jsdom has no pseudo-element layout; use its normal style implementation
  // when Ant's scrollbar measurement asks for a pseudo-element.
  const getComputedStyle = window.getComputedStyle.bind(window);
  jest.spyOn(window, "getComputedStyle").mockImplementation((element) => getComputedStyle(element));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  jest.restoreAllMocks();
});

it.each([pending, ready, failure])("Desktop owns all windows and never mounts a browser panel for $status", async (state) => {
  mockDesktopMode = true;
  mockState.rightSidebarOpen = true;
  await render(state);
  expect(all(".ant-drawer, .ant-modal")).toHaveLength(0);
  expect(mockBtwTab).not.toHaveBeenCalled();
  expect(mockExplainSurface).not.toHaveBeenCalled();
});

it("the full website's root route leaves the existing RightSidebar as the only BTW host", async () => {
  mockPathname = "/";
  mockState.rightSidebarOpen = true;
  await render();
  expect(all(".ant-drawer-open")).toHaveLength(0);
  expect(mockBtwTab).not.toHaveBeenCalled();
  expect(all(".ant-modal")).toHaveLength(0);
});

it.each(["/agent/demo", "/copilot/demo"])("%s reuses one BtwTab inside one drawer without an extra explanation modal", async (pathname) => {
  mockPathname = pathname;
  mockState.rightSidebarOpen = true;
  await render();
  await render();
  expect(all(".ant-drawer-open")).toHaveLength(1);
  expect(all('[data-testid="btw-tab"]')).toHaveLength(1);
  expect(all(".ant-modal")).toHaveLength(0);
  expect(mockGetSession).toHaveBeenCalledWith("chat-a");
  await act(async () => find(".ant-drawer-close")!.click());
  expect(mockDispatch).toHaveBeenCalledTimes(1);
  expect(mockDispatch).toHaveBeenCalledWith({ type: "CLOSE_RIGHT_SIDEBAR" });
  expect(onCloseExplanation).not.toHaveBeenCalled();
  mockState.rightSidebarOpen = false;
  await render();
  expect(all(".ant-drawer-open")).toHaveLength(0);
});

it.each(["closed", "other-tab", "no-session"])("does not create a BTW guest when its sidebar is %s", async (reason) => {
  mockState.rightSidebarOpen = reason !== "closed";
  if (reason === "other-tab") mockState.rightSidebarOpenTab = "debug";
  if (reason === "no-session") mockGetSession.mockReturnValue(null);
  await render();
  expect(all(".ant-drawer-open")).toHaveLength(0);
  expect(mockBtwTab).not.toHaveBeenCalled();
});

it("shows one pending explanation with a close action before any explanation viewer mounts", async () => {
  await render(pending);
  expect(all(".ant-modal")).toHaveLength(1);
  expect(all(".ant-modal-mask, .ant-drawer-mask")).toHaveLength(0);
  expect(find('[role="status"]')?.textContent).toContain("selection.explain.preparing");
  expect(mockExplainSurface).not.toHaveBeenCalled();
  expect(mockBtwTab).not.toHaveBeenCalled();
  await act(async () => find(".ant-modal-close")!.click());
  expect(onCloseExplanation).toHaveBeenCalledTimes(1);
  expect(mockDispatch).not.toHaveBeenCalled();
  await render(null);
  expect(all(".ant-modal")).toHaveLength(0);
});

it("replaces pending content with exactly one embedded viewer and keeps that viewer mounted across rerenders", async () => {
  await render(pending);
  await render(ready);
  const viewer = find('[data-testid="explain-surface"]')!;
  expect(viewer).not.toBeNull();
  expect(viewer.dataset).toMatchObject({ chat: "chat-a", run: "run-a", embedded: "true" });
  const instance = viewer.dataset.instance;
  await render({ ...ready });
  expect(all(".ant-modal")).toHaveLength(1);
  expect(all('[data-testid="explain-surface"]')).toHaveLength(1);
  expect(find('[data-testid="explain-surface"]')?.dataset.instance).toBe(instance);
  expect(mockExplainSurface).toHaveBeenLastCalledWith({ chatId: "chat-a", runId: "run-a", embedded: true });
  expect(find('[role="status"]')).toBeNull();
  await render(null);
  expect(all('[data-testid="explain-surface"]')).toHaveLength(0);
  expect(all(".ant-modal")).toHaveLength(0);
});

it("a new explanation request gets a fresh viewer rather than reusing the previous run's state", async () => {
  await render(ready);
  const first = find('[data-testid="explain-surface"]')!.dataset.instance;
  await render({ requestId: "explain-b", chatId: "chat-a", runId: "run-b", status: "ready" });
  expect(all('[data-testid="explain-surface"]')).toHaveLength(1);
  expect(find('[data-testid="explain-surface"]')!.dataset.instance).not.toBe(first);
  expect(find('[data-testid="explain-surface"]')!.dataset.run).toBe("run-b");
});

it("renders a recoverable explanation error without mounting a stale viewer", async () => {
  await render(failure);
  expect(all(".ant-modal")).toHaveLength(1);
  expect(find('[role="alert"]')?.textContent).toBe(failure.message);
  expect(mockExplainSurface).not.toHaveBeenCalled();
  await act(async () => find(".ant-modal-close")!.click());
  expect(onCloseExplanation).toHaveBeenCalledTimes(1);
});

it("root-route explanations use one modal without duplicating the already-owned BTW sidebar", async () => {
  mockPathname = "/";
  mockState.rightSidebarOpen = true;
  await render(ready);
  expect(all(".ant-modal")).toHaveLength(1);
  expect(all('[data-testid="explain-surface"]')).toHaveLength(1);
  expect(all(".ant-drawer-open")).toHaveLength(0);
  expect(mockBtwTab).not.toHaveBeenCalled();
});

it("closing an explanation preserves the existing side-question drawer", async () => {
  mockState.rightSidebarOpen = true;
  await render(ready);
  expect(all(".ant-modal")).toHaveLength(1);
  expect(all(".ant-drawer-open")).toHaveLength(1);
  await act(async () => find(".ant-modal-close")!.click());
  await render(null);
  expect(onCloseExplanation).toHaveBeenCalledTimes(1);
  expect(mockDispatch).not.toHaveBeenCalled();
  expect(all(".ant-drawer-open")).toHaveLength(1);
  expect(all('[data-testid="btw-tab"]')).toHaveLength(1);
});
