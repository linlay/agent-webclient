/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TimelineTextSearchControl } from "./TimelineTextSearchControl";

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));
jest.mock("./TimelineTextSearchProvider", () => ({
  useTimelineTextSearch: () => mockSearch,
}));

const mockSearch = {
  open: false,
  query: "",
  total: 0,
  activeIndex: -1,
  searchableNodeIds: new Set<string>(),
  openSearch: jest.fn(),
  closeSearch: jest.fn(),
  setQuery: jest.fn(),
  goPrev: jest.fn(),
  goNext: jest.fn(),
};

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("TimelineTextSearchControl", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockSearch.searchableNodeIds = new Set();
    mockSearch.open = false;
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it.each(["MacIntel", "Win32"])("keeps the same input through empty chat content on %s", platform => {
    Object.defineProperty(navigator, "platform", { configurable: true, value: platform });
    const render = () => act(() => root.render(
      React.createElement(TimelineTextSearchControl, { appearance: "input" }),
    ));
    mockSearch.searchableNodeIds = new Set(["chat-a-message"]);
    render();
    const input = container.querySelector("input")!;
    expect(input).not.toBeNull();
    expect(input.disabled).toBe(false);
    expect(input.getAttribute("aria-keyshortcuts")).toBe(platform === "MacIntel" ? "Meta+F" : "Control+F");

    mockSearch.searchableNodeIds = new Set();
    render();
    expect(container.querySelector("input")).toBe(input);
    expect(input.disabled).toBe(true);

    mockSearch.searchableNodeIds = new Set(["chat-b-message"]);
    render();
    expect(container.querySelector("input")).toBe(input);
    expect(input.disabled).toBe(false);
  });

  it("keeps the compact button hidden for an empty timeline", () => {
    act(() => root.render(React.createElement(TimelineTextSearchControl)));
    expect(container.childElementCount).toBe(0);
  });
});
