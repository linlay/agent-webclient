/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { usePanelResize } from "./usePanelResize";

type DragMove = { clientX?: number; clientY?: number };

type HandleProps = {
  button?: number;
  pointerId?: number;
  clientX?: number;
  clientY?: number;
};

function firePointer(
  type: string,
  init: { pointerId?: number; clientX?: number; clientY?: number } = {},
) {
  const event = new Event(type);
  Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 1 });
  Object.defineProperty(event, "clientX", { value: init.clientX ?? 0 });
  Object.defineProperty(event, "clientY", { value: init.clientY ?? 0 });
  window.dispatchEvent(event);
}

async function mount(options: Parameters<typeof usePanelResize>[0]) {
  (globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const states = { isResizing: [] as boolean[] };
  const handleRef: { current: HTMLElement | null } = { current: null };
  const downHandlers: Array<(event: never) => void> = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe() {
    const { isResizing, handlePointerDown } = usePanelResize(options);
    states.isResizing.push(isResizing);
    return React.createElement("div", {
      ref: (node: HTMLDivElement | null) => {
        if (!node) return;
        handleRef.current = node;
        downHandlers.length = 0;
        downHandlers.push(handlePointerDown as unknown as (event: never) => void);
      },
    });
  }

  const harness = {
    states,
    handleRef,
    downHandlers,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
    async drag(
      moves: DragMove[],
      endType: "pointerup" | "pointercancel" = "pointerup",
    ) {
      await act(async () => {
        downHandlers[0]({
          button: 0,
          pointerId: 1,
          currentTarget: handleRef.current,
          preventDefault: () => undefined,
          clientX: 0,
          clientY: 0,
        } as never);
      });
      await act(async () => {
        for (const move of moves) {
          firePointer("pointermove", move);
        }
        firePointer(endType, moves[moves.length - 1]);
      });
    },
  };

  await act(async () => root.render(React.createElement(Probe)));
  return harness;
}

describe("usePanelResize", () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, "setPointerCapture", {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(Element.prototype, "releasePointerCapture", {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(Element.prototype, "hasPointerCapture", {
      configurable: true,
      value: jest.fn(() => true),
    });
    document.body.className = "";
  });

  it("reports signed deltas for horizontal drags and toggles the body class", async () => {
    const onResizeStart = jest.fn();
    const onResize = jest.fn();
    const onResizeEnd = jest.fn();
    const harness = await mount({
      axis: "horizontal",
      onResizeStart,
      onResize,
      onResizeEnd,
    });
    await harness.drag([{ clientX: 100 }, { clientX: 140 }]);
    expect(onResizeStart).toHaveBeenCalledTimes(1);
    expect(onResize.mock.calls.map(([delta]) => delta)).toEqual([100, 140]);
    expect(onResizeEnd).toHaveBeenCalledWith(140);
    expect(harness.states.isResizing).toContain(true);
    expect(harness.states.isResizing[harness.states.isResizing.length - 1]).toBe(
      false,
    );
    expect(document.body.classList.contains("panel-resizing-horizontal")).toBe(
      false,
    );
    await harness.unmount();
  });

  it("inverts delta direction and uses the vertical class for bottom docks", async () => {
    const onResize = jest.fn();
    const harness = await mount({ axis: "vertical", invert: true, onResize });
    await harness.drag([{ clientY: 300 }, { clientY: -60 }]);
    expect(onResize.mock.calls.map(([delta]) => delta)).toEqual([-300, 60]);
    expect(document.body.classList.contains("panel-resizing-vertical")).toBe(
      false,
    );
    await harness.unmount();
  });

  it("ignores non-primary buttons and cleans up on pointercancel", async () => {
    const onResize = jest.fn();
    const onResizeEnd = jest.fn();
    const harness = await mount({ axis: "horizontal", onResize, onResizeEnd });
    await act(async () => {
      harness.downHandlers[0]({
        button: 2,
        currentTarget: harness.handleRef.current,
        preventDefault: () => undefined,
      } as never);
    });
    expect(onResize).not.toHaveBeenCalled();
    await harness.drag([{ clientX: 50 }], "pointercancel");
    expect(onResize).toHaveBeenCalledWith(50);
    expect(onResizeEnd).toHaveBeenCalledWith(50);
    expect(document.body.className).toBe("");
    await harness.unmount();
  });
});
