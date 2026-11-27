/** @jest-environment jsdom */
import React, { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useMobileSwipeGestures, type MobileSwipePanelBinding } from "./useMobileSwipeGestures";
import type { MobileSwipeDrawerHandle } from "../MobileSwipeDrawer";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const WIDTH = 320;
let root: Root;
let host: HTMLDivElement;
let container: HTMLDivElement | undefined;

function createHandle(initiallyOpen = false, width = WIDTH) {
  const state = { progress: initiallyOpen ? width : 0, dragging: false, width };
  const handle = {
    state,
    progressPx: () => state.progress,
    width: () => state.width,
    beginDrag: jest.fn(() => {
      state.dragging = true;
    }),
    dragTo: jest.fn((value: number) => {
      state.progress = value;
    }),
    endDrag: jest.fn((open: boolean) => {
      state.dragging = false;
      state.progress = open ? state.width : 0;
    }),
    cancelDrag: jest.fn(() => {
      state.dragging = false;
    }),
  };
  return handle as typeof handle & MobileSwipeDrawerHandle;
}

function createBinding(handle: ReturnType<typeof createHandle>, open: boolean) {
  return {
    ref: { current: handle },
    open,
    onOpen: jest.fn(),
    onClose: jest.fn(),
  } as MobileSwipePanelBinding & {
    onOpen: jest.Mock;
    onClose: jest.Mock;
  };
}

function Harness({
  left,
  right,
  disabled,
}: {
  left: MobileSwipePanelBinding;
  right: MobileSwipePanelBinding;
  disabled?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useMobileSwipeGestures({ rootRef, left, right, disabled });
  return (
    <div ref={rootRef} data-root>
      <button data-testid="plain">Plain</button>
      <textarea data-testid="field" defaultValue="" />
      <div
        data-testid="scroller"
        style={{ overflowX: "auto", width: 100 }}
      >
        wide content
      </div>
    </div>
  );
}

async function mount(
  left: ReturnType<typeof createBinding>,
  right: ReturnType<typeof createBinding>,
  disabled = false,
) {
  await act(async () =>
    root.render(<Harness left={left} right={right} disabled={disabled} />),
  );
  container = host.querySelector<HTMLDivElement>("[data-root]")!;
  container.getBoundingClientRect = () =>
    ({ left: 0, right: 390, top: 0, bottom: 844, width: 390, height: 844, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  const scroller = host.querySelector<HTMLElement>("[data-testid='scroller']")!;
  Object.defineProperty(scroller, "scrollWidth", { configurable: true, value: 500 });
  Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 100 });
}

let clock = 1_000_000;

function dispatch(
  type: string,
  target: EventTarget,
  x: number,
  y: number,
  pointerType = "touch",
) {
  clock += 16;
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  Object.defineProperty(event, "isPrimary", { value: true });
  target.dispatchEvent(event);
  return event;
}

function drag(
  from: [number, number],
  points: Array<[number, number]>,
  target: EventTarget = container!,
) {
  dispatch("pointerdown", target, from[0], from[1]);
  for (const [x, y] of points) dispatch("pointermove", window, x, y);
  dispatch("pointerup", window, points.at(-1)?.[0] ?? from[0], points.at(-1)?.[1] ?? from[1]);
}

beforeEach(() => {
  clock = 1_000_000;
  jest.spyOn(performance, "now").mockImplementation(() => clock);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  container = undefined;
});

afterEach(async () => {
  jest.restoreAllMocks();
  await act(async () => root.unmount());
  host.remove();
  document.querySelectorAll(".ant-drawer-open, .ant-modal-wrap").forEach(node => node.remove());
});

it("opens the left drawer on a rightward swipe", async () => {
  const left = createBinding(createHandle(), false);
  const right = createBinding(createHandle(), false);
  await mount(left, right);
  drag([100, 400], [[112, 400], [160, 401], [300, 401]]);
  expect(left.ref.current?.beginDrag).toHaveBeenCalledTimes(1);
  expect(left.ref.current?.dragTo).toHaveBeenLastCalledWith(200);
  expect(left.onOpen).toHaveBeenCalledTimes(1);
  expect(right.onOpen).not.toHaveBeenCalled();
});

it("keeps gestures alive inside a host page drawer", async () => {
  const drawer = document.createElement("div");
  drawer.className = "ant-drawer ant-drawer-open";
  document.body.append(drawer);
  drawer.append(host);
  const left = createBinding(createHandle(), false);
  const right = createBinding(createHandle(), false);
  await mount(left, right);
  drag([100, 400], [[160, 400], [300, 401]]);
  expect(left.onOpen).toHaveBeenCalledTimes(1);
});

it("opens the right drawer on a leftward swipe", async () => {
  const left = createBinding(createHandle(), false);
  const right = createBinding(createHandle(), false);
  await mount(left, right);
  drag([280, 400], [[260, 400], [120, 401]]);
  expect(right.onOpen).toHaveBeenCalledTimes(1);
  expect(left.onOpen).not.toHaveBeenCalled();
});

it("closes the open right drawer on a rightward swipe", async () => {
  const rightHandle = createHandle(true);
  const right = createBinding(rightHandle, true);
  const left = createBinding(createHandle(), false);
  await mount(left, right);
  drag([100, 400], [[130, 400], [380, 401]]);
  expect(rightHandle.beginDrag).toHaveBeenCalledTimes(1);
  expect(right.onClose).toHaveBeenCalledTimes(1);
  expect(right.onOpen).not.toHaveBeenCalled();
});

it("closes the open left drawer on a leftward swipe", async () => {
  const leftHandle = createHandle(true);
  const left = createBinding(leftHandle, true);
  const right = createBinding(createHandle(), false);
  await mount(left, right);
  drag([300, 400], [[250, 400], [60, 401]]);
  expect(leftHandle.beginDrag).toHaveBeenCalledTimes(1);
  expect(left.onClose).toHaveBeenCalledTimes(1);
});

it("can reverse a drawer caught mid-settle", async () => {
  const handle = createHandle(true);
  handle.state.progress = 120;
  const right = createBinding(handle, true);
  const left = createBinding(createHandle(), false);
  await mount(left, right);
  drag([100, 400], [[70, 400], [20, 401]]);
  expect(handle.beginDrag).toHaveBeenCalledTimes(1);
  expect(handle.endDrag).toHaveBeenCalledWith(true, expect.any(Number));
  expect(right.onClose).not.toHaveBeenCalled();
});

it("closes a drawer caught mid-settle when swiped back", async () => {
  const handle = createHandle(true);
  handle.state.progress = 120;
  const right = createBinding(handle, true);
  const left = createBinding(createHandle(), false);
  await mount(left, right);
  drag([60, 400], [[110, 400], [320, 401]]);
  expect(handle.endDrag).toHaveBeenCalledWith(false, expect.any(Number));
  expect(right.onClose).toHaveBeenCalledTimes(1);
});

it("labels a vertical scroll as a scroll, not a drawer gesture", async () => {
  const left = createBinding(createHandle(), false);
  const right = createBinding(createHandle(), false);
  await mount(left, right);
  drag([100, 400], [[104, 430], [108, 560]]);
  expect(left.ref.current?.beginDrag).not.toHaveBeenCalled();
  expect(right.ref.current?.beginDrag).not.toHaveBeenCalled();
  expect(left.onOpen).not.toHaveBeenCalled();
  expect(right.onOpen).not.toHaveBeenCalled();
});

it("returns to the logical state when an open drawer is touched but not swiped", async () => {
  const rightHandle = createHandle(true);
  const right = createBinding(rightHandle, true);
  const left = createBinding(createHandle(), false);
  await mount(left, right);
  drag([100, 400], [[103, 410]]);
  expect(rightHandle.beginDrag).toHaveBeenCalledTimes(1);
  expect(rightHandle.cancelDrag).toHaveBeenCalledTimes(1);
  expect(right.onClose).not.toHaveBeenCalled();
});

it("does not claim a short, slow drag", async () => {
  const left = createBinding(createHandle(), false);
  const right = createBinding(createHandle(), false);
  await mount(left, right);
  dispatch("pointerdown", container!, 100, 400);
  clock += 600;
  dispatch("pointermove", window, 110, 400);
  clock += 400;
  dispatch("pointerup", window, 110, 400);
  expect(left.onOpen).not.toHaveBeenCalled();
  expect(left.ref.current?.endDrag).toHaveBeenCalledWith(false, expect.any(Number));
});

it("only starts mouse gestures from a screen edge", async () => {
  const left = createBinding(createHandle(), false);
  const right = createBinding(createHandle(), false);
  await mount(left, right);
  dispatch("pointerdown", container!, 200, 400, "mouse");
  dispatch("pointermove", window, 320, 400, "mouse");
  dispatch("pointerup", window, 320, 400, "mouse");
  expect(left.onOpen).not.toHaveBeenCalled();
  dispatch("pointerdown", container!, 5, 400, "mouse");
  dispatch("pointermove", window, 200, 400, "mouse");
  dispatch("pointerup", window, 200, 400, "mouse");
  expect(left.onOpen).toHaveBeenCalledTimes(1);
});

it("ignores swipes that start in text fields or horizontal scrollers", async () => {
  const left = createBinding(createHandle(), false);
  const right = createBinding(createHandle(), false);
  await mount(left, right);
  drag([100, 400], [[300, 400]], host.querySelector("[data-testid='field']")!);
  drag([80, 420], [[300, 420]], host.querySelector("[data-testid='scroller']")!);
  expect(left.ref.current?.beginDrag).not.toHaveBeenCalled();
  expect(right.ref.current?.beginDrag).not.toHaveBeenCalled();
});

it("does nothing while the shell is disabled", async () => {
  const left = createBinding(createHandle(), false);
  const right = createBinding(createHandle(), false);
  await mount(left, right, true);
  drag([100, 400], [[300, 400]]);
  expect(left.onOpen).not.toHaveBeenCalled();
  expect(right.onOpen).not.toHaveBeenCalled();
});

it("swallows the click that would follow a claimed swipe", async () => {
  const left = createBinding(createHandle(), false);
  const right = createBinding(createHandle(), false);
  await mount(left, right);
  const button = host.querySelector<HTMLButtonElement>("[data-testid='plain']")!;
  const onClick = jest.fn();
  button.addEventListener("click", onClick);
  drag([100, 400], [[300, 400]], button);
  button.click();
  expect(left.onOpen).toHaveBeenCalledTimes(1);
  expect(onClick).not.toHaveBeenCalled();
});
