/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserSelectionToolbar, type BrowserSelectionToolbarProps } from "./BrowserSelectionToolbar";
import { registerDesktopContextMenuTarget } from "@/shared/data/desktop/desktopContextMenu";

let mockDesktopMode = false;
jest.mock("@/shared/utils/routing", () => ({ isDesktopAppMode: () => mockDesktopMode }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ locale: "en-US", t: (key: string) => key }) }));
jest.mock("@/shared/ui/MaterialIcon", () => ({
  MaterialIcon: ({ name }: { name: string }) => React.createElement("span", { "data-icon": name, "aria-hidden": true }),
}));

function rect(left = 100, top = 100, width = 100, height = 20): DOMRect {
  return { left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

describe("BrowserSelectionToolbar DOM interaction", () => {
  const originalRects = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");
  const originalPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  let scope: HTMLElement;
  let message: HTMLElement;
  let mount: HTMLElement;
  let root: Root;
  let unregister: () => void;
  let rangeRect: DOMRect;
  let hitElement: Element;
  let frameId: number;
  let frames: Map<number, FrameRequestCallback>;
  let onAction: jest.Mock;

  function render(props: Partial<BrowserSelectionToolbarProps> = {}) {
    act(() => root.render(React.createElement(BrowserSelectionToolbar, {
      enabled: true, scopeElement: scope, onAction, ...props,
    })));
  }

  function select(start = 0, end = (message.textContent || "").length, notify = true) {
    const range = document.createRange();
    range.setStart(message.firstChild!, start);
    range.setEnd(message.firstChild!, end);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    if (notify) document.dispatchEvent(new Event("selectionchange"));
  }

  async function flushFrames() {
    await act(async () => { await Promise.resolve(); });
    act(() => {
      const pending = Array.from(frames.entries());
      frames.clear();
      for (const [, callback] of pending) callback(0);
    });
    await act(async () => { await Promise.resolve(); });
  }

  const toolbar = () => document.querySelector<HTMLElement>('[role="toolbar"]');
  const buttons = () => Array.from(toolbar()?.querySelectorAll<HTMLButtonElement>("button") || []);

  beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
  afterAll(() => { delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT; });

  beforeEach(() => {
    document.body.innerHTML = "";
    document.getSelection()?.removeAllRanges();
    mockDesktopMode = false;
    rangeRect = rect();
    frames = new Map(); frameId = 0;
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id); });
    jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      return this.getAttribute("role") === "toolbar" ? rect(0, 0, 320, 40) : rangeRect;
    });
    Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [rangeRect] });
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => hitElement });
    scope = document.createElement("main");
    message = document.createElement("article");
    message.textContent = "selected text";
    scope.appendChild(message);
    document.body.appendChild(scope);
    hitElement = message;
    unregister = registerDesktopContextMenuTarget(message, { targetId: "message-1", kind: "message", handlers: {} });
    mount = document.createElement("div");
    document.body.appendChild(mount);
    root = createRoot(mount);
    onAction = jest.fn(async () => ({ ok: true }));
  });

  afterEach(() => {
    act(() => root.unmount());
    unregister();
    document.getSelection()?.removeAllRanges();
    document.body.innerHTML = "";
    jest.restoreAllMocks();
    if (originalRects) Object.defineProperty(Range.prototype, "getClientRects", originalRects);
    else Reflect.deleteProperty(Range.prototype, "getClientRects");
    if (originalPoint) Object.defineProperty(document, "elementFromPoint", originalPoint);
    else Reflect.deleteProperty(document, "elementFromPoint");
  });

  it.each([
    [0, "add-to-chat"], [1, "more-details"], [2, "ask-in-side-chat"],
  ])("keeps the DOM selection on click and dispatches only action %s / %s", async (index, action) => {
    render(); select(); await flushFrames();
    expect(buttons()).toHaveLength(3);
    expect(toolbar()?.textContent).not.toContain("selected text");
    const button = buttons()[Number(index)];
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    act(() => { button.dispatchEvent(down); });
    expect(down.defaultPrevented).toBe(true);
    expect(document.getSelection()?.toString()).toBe("selected text");
    await act(async () => { button.click(); await Promise.resolve(); });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({
      action,
      fragment: expect.objectContaining({
        targetId: "message-1", reference: expect.objectContaining({ meta: { text: "selected text", sourceKind: "message" } }),
      }),
    });
    expect(toolbar()).toBeNull();
  });

  it("blocks duplicate clicks until an asynchronous action settles", async () => {
    let finish!: (result: { ok: boolean }) => void;
    onAction.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(); select(); await flushFrames();
    const button = buttons()[0];
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(toolbar()?.getAttribute("aria-busy")).toBe("true");
    expect(buttons().every((item) => item.disabled)).toBe(true);
    await act(async () => { finish({ ok: true }); await Promise.resolve(); });
    expect(toolbar()).toBeNull();
  });

  it("revalidates offsets before click even if selectionchange has not arrived", async () => {
    message.textContent = "same same";
    render(); select(0, 4); await flushFrames();
    const button = buttons()[0];
    select(5, 9, false);
    await act(async () => { button.click(); await Promise.resolve(); });
    expect(onAction).not.toHaveBeenCalled();
    expect(toolbar()).toBeNull();
  });

  it.each(["scroll", "resize", "blur"])("hides on %s and does not resurrect from a retained stale selection", async (eventName) => {
    render(); select(); await flushFrames();
    expect(toolbar()).not.toBeNull();
    act(() => window.dispatchEvent(new Event(eventName)));
    document.dispatchEvent(new Event("selectionchange"));
    await flushFrames();
    expect(toolbar()).toBeNull();
  });

  it("hides when selection is cleared or its streamed message is detached", async () => {
    render(); select(); await flushFrames();
    document.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    await flushFrames();
    expect(toolbar()).toBeNull();
    select(); await flushFrames();
    expect(toolbar()).not.toBeNull();
    act(() => message.remove());
    await flushFrames();
    expect(toolbar()).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("waits for pointer release and can recover from pointer cancellation with keyboard selection", async () => {
    render();
    act(() => message.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 })));
    select(); await flushFrames();
    expect(toolbar()).toBeNull();
    act(() => message.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 })));
    await flushFrames();
    expect(toolbar()).not.toBeNull();
    act(() => {
      message.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
      message.dispatchEvent(new Event("pointercancel", { bubbles: true }));
      message.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "ArrowRight", shiftKey: true }));
    });
    await flushFrames();
    expect(toolbar()).not.toBeNull();
  });

  it("supports Tab entry, directional navigation and Escape without clearing selected text", async () => {
    render(); select(); await flushFrames();
    const tab = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" });
    act(() => message.dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons()[0]);
    act(() => buttons()[0].dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowRight" })));
    expect(document.activeElement).toBe(buttons()[1]);
    act(() => buttons()[1].dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "End" })));
    expect(document.activeElement).toBe(buttons()[2]);
    expect(document.getSelection()?.toString()).toBe("selected text");
    act(() => buttons()[2].dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" })));
    expect(toolbar()).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("hides when keyboard focus leaves the toolbar for another control", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    render(); select(); await flushFrames();
    act(() => input.focus());
    expect(toolbar()).toBeNull();
  });

  it.each([
    { enabled: false, desktop: false },
    { enabled: true, desktop: true },
  ])("does not register a visible toolbar when enabled=$enabled / Desktop=$desktop", async ({ enabled, desktop }) => {
    mockDesktopMode = desktop;
    render({ enabled }); select(); await flushFrames();
    expect(toolbar()).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("does not capture another conversation outside its owning scope", async () => {
    render({ scopeElement: document.createElement("main") });
    select(); await flushFrames();
    expect(toolbar()).toBeNull();
    render({ scopeElement: null });
    select(); await flushFrames();
    expect(toolbar()).toBeNull();
  });

  it("keeps its measured toolbar within viewport edges and preserves the native context menu", async () => {
    rangeRect = rect(window.innerWidth - 30, 2, 25, 20);
    render(); select(); await flushFrames();
    const rendered = toolbar()!;
    expect(Number.parseFloat(rendered.style.left)).toBeGreaterThanOrEqual(8);
    expect(Number.parseFloat(rendered.style.left) + 320).toBeLessThanOrEqual(window.innerWidth - 8);
    expect(Number.parseFloat(rendered.style.top)).toBeGreaterThanOrEqual(8);
    expect(Number.parseFloat(rendered.style.top) + 40).toBeLessThanOrEqual(window.innerHeight - 8);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
    act(() => message.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    expect(onAction).not.toHaveBeenCalled();
  });
});
