/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConfigProvider } from "antd";
import { BrowserSelectionPanels } from "./BrowserSelectionPanels";

let mockDesktopMode = false;
let mockPathname = "/agent/demo";
let mockState: { chatId: string; rightSidebarOpen: boolean; rightSidebarOpenTab: string };
const mockDispatch = jest.fn();
const mockGetSession = jest.fn();
const mockBtwTab = jest.fn();

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

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;

async function render() {
  await act(async () => root.render(React.createElement(ConfigProvider, { theme: { token: { motion: false } } },
    React.createElement(BrowserSelectionPanels))));
}

const find = (selector: string) => document.body.querySelector<HTMLElement>(selector);
const all = (selector: string) => document.body.querySelectorAll(selector);

beforeEach(() => {
  jest.clearAllMocks();
  mockDesktopMode = false;
  mockPathname = "/agent/demo";
  mockState = { chatId: "chat-a", rightSidebarOpen: false, rightSidebarOpenTab: "btw" };
  mockGetSession.mockReturnValue({ parentChatId: "chat-a", draft: "unfinished side question" });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: jest.fn(() => ({
    matches: false, addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  })) });
  const getComputedStyle = window.getComputedStyle.bind(window);
  jest.spyOn(window, "getComputedStyle").mockImplementation((element) => getComputedStyle(element));
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  jest.restoreAllMocks();
});

it("Desktop owns the WorkPanel and never mounts a browser drawer or explanation", async () => {
  mockDesktopMode = true;
  mockState.rightSidebarOpen = true;
  await render();
  expect(all(".ant-drawer, .ant-modal")).toHaveLength(0);
  expect(mockBtwTab).not.toHaveBeenCalled();
});

it("keeps the existing browser BTW drawer as a single panel and never mounts an explanation modal", async () => {
  await render();
  expect(all(".ant-drawer-open, .ant-modal")).toHaveLength(0);
  mockState.rightSidebarOpen = true;
  await render();
  await render();
  expect(all(".ant-drawer-open")).toHaveLength(1);
  expect(all('[data-testid="btw-tab"]')).toHaveLength(1);
  expect(all(".ant-modal")).toHaveLength(0);
});

it("the browser root route leaves its existing RightSidebar in charge", async () => {
  mockPathname = "/";
  mockState.rightSidebarOpen = true;
  await render();
  expect(all(".ant-drawer-open, .ant-modal")).toHaveLength(0);
  expect(mockBtwTab).not.toHaveBeenCalled();
});

it("closing the browser drawer only hides the panel and keeps its BTW session", async () => {
  mockState.rightSidebarOpen = true;
  await render();
  await act(async () => find(".ant-drawer-close")!.click());
  expect(mockDispatch).toHaveBeenCalledTimes(1);
  expect(mockDispatch).toHaveBeenCalledWith({ type: "CLOSE_RIGHT_SIDEBAR" });
  expect(mockGetSession()).toMatchObject({ draft: "unfinished side question" });
});
