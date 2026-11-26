/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { isOverflowingText, useOverflowTitle } from "./useOverflowTitle";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type ObserverRecord = { callback: ResizeObserverCallback; observed: Element[] };

describe("useOverflowTitle", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;
  let observers: ObserverRecord[];
  const originalResizeObserver = globalThis.ResizeObserver;

  class FakeResizeObserver {
    private readonly record: ObserverRecord;

    constructor(callback: ResizeObserverCallback) {
      this.record = { callback, observed: [] };
      observers.push(this.record);
    }

    observe(target: Element) {
      this.record.observed.push(target);
    }

    unobserve() {}

    disconnect() {}
  }

  function setWidths(element: Element, clientWidth: number, scrollWidth: number) {
    Object.defineProperty(element, "clientWidth", { configurable: true, value: clientWidth });
    Object.defineProperty(element, "scrollWidth", { configurable: true, value: scrollWidth });
  }

  function titleElement(): HTMLElement {
    return container.querySelector<HTMLElement>("[data-testid=title]")!;
  }

  async function notifyResize() {
    await act(async () => {
      observers.forEach((record) => record.callback([], {} as ResizeObserver));
    });
  }

  function Probe({ text }: { text: string }) {
    const { ref, title } = useOverflowTitle(text);
    return (
      <span ref={ref} data-testid="title" title={title}>
        <strong>{text}</strong>
      </span>
    );
  }

  beforeEach(async () => {
    observers = [];
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(<Probe text="very long registry title" />));
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container.remove();
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it("starts without a title while the text fits", () => {
    expect(titleElement().getAttribute("title")).toBeNull();
  });

  it("shows the full text as the title once the row clips it", async () => {
    setWidths(titleElement(), 80, 200);
    await notifyResize();
    expect(titleElement().getAttribute("title")).toBe("very long registry title");
  });

  it("drops the title again after the row is wide enough", async () => {
    setWidths(titleElement(), 80, 200);
    await notifyResize();
    setWidths(titleElement(), 240, 200);
    await notifyResize();
    expect(titleElement().getAttribute("title")).toBeNull();
  });

  it("detects clipping of a nested ellipsized child", () => {
    const row = document.createElement("span");
    const child = document.createElement("strong");
    row.appendChild(child);
    setWidths(row, 200, 200);
    setWidths(child, 50, 150);
    expect(isOverflowingText(row)).toBe(true);
  });

  it("treats a missing element as not overflowing", () => {
    expect(isOverflowingText(null)).toBe(false);
  });
});
