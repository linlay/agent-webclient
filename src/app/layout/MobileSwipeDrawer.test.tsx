/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MobileSwipeDrawer,
  type MobileSwipeDrawerHandle,
} from "./MobileSwipeDrawer";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const PANEL_WIDTH = 320;
const originalOffsetWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetWidth",
);
let root: Root;
let host: HTMLDivElement;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => PANEL_WIDTH,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: jest.fn(() => ({
      matches: true,
      media: "",
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
});

afterAll(() => {
  if (originalOffsetWidth) {
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetWidth",
      originalOffsetWidth,
    );
  } else {
    delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
  }
});

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function renderDrawer(
  open: boolean,
  props: { ariaLabel?: string; onClose?: () => void } = {},
) {
  const ref = React.createRef<MobileSwipeDrawerHandle>();
  const onClose = props.onClose ?? jest.fn();
  const render = (nextOpen: boolean) => (
    <MobileSwipeDrawer
      ref={ref}
      side="right"
      open={nextOpen}
      onClose={onClose}
      ariaLabel={props.ariaLabel ?? "Content panel"}
    >
      <button data-testid="inside">Inside</button>
    </MobileSwipeDrawer>
  );
  await act(async () => root.render(render(open)));
  return {
    ref,
    onClose,
    async setOpen(nextOpen: boolean) {
      await act(async () => root.render(render(nextOpen)));
    },
  };
}

it("stays out of the interaction and accessibility tree while closed", async () => {
  await renderDrawer(false);
  const layer = host.querySelector<HTMLElement>("[data-mobile-drawer='right']")!;
  expect(layer.getAttribute("aria-hidden")).toBe("true");
  expect(layer.hasAttribute("inert")).toBe(true);
  expect(layer.style.visibility).toBe("hidden");
  expect(
    host.querySelector<HTMLElement>("[role='dialog']")?.getAttribute("aria-modal"),
  ).toBeNull();
});

it("settles fully open on the side's resting edge", async () => {
  const drawer = await renderDrawer(true);
  await act(async () => {});
  const layer = host.querySelector<HTMLElement>("[data-mobile-drawer='right']")!;
  const panel = host.querySelector<HTMLElement>("[role='dialog']")!;
  expect(drawer.ref.current?.progressPx()).toBe(PANEL_WIDTH);
  expect(panel.style.transform).toBe("translate3d(0px, 0, 0)");
  expect(layer.getAttribute("aria-hidden")).toBeNull();
  expect(layer.hasAttribute("inert")).toBe(false);
  expect(layer.style.visibility).toBe("visible");
  expect(panel.getAttribute("aria-modal")).toBe("true");
});

it("follows the finger and returns to the logical state on cancel", async () => {
  const drawer = await renderDrawer(true);
  await act(async () => {
    drawer.ref.current?.beginDrag();
    drawer.ref.current?.dragTo(120);
  });
  expect(drawer.ref.current?.progressPx()).toBe(120);
  const panel = host.querySelector<HTMLElement>("[role='dialog']")!;
  expect(panel.style.transform).toBe("translate3d(200px, 0, 0)");
  await act(async () => drawer.ref.current?.cancelDrag());
  expect(drawer.ref.current?.progressPx()).toBe(PANEL_WIDTH);
});

it("names the dialog without drawing a title bar", async () => {
  // 面板内容自带标签栏与关闭入口，抽屉不再额外画标题行。
  await renderDrawer(true);
  await act(async () => {});
  expect(
    host.querySelector<HTMLElement>("[role='dialog']")?.getAttribute("aria-label"),
  ).toBe("Content panel");
  expect(host.querySelectorAll("button")).toHaveLength(1);
});

it("closes through the mask and Escape", async () => {
  const drawer = await renderDrawer(true);
  await act(async () => {});
  await act(async () => {
    host.querySelector<HTMLElement>("[data-mobile-swipe-mask='right']")!.click();
  });
  expect(drawer.onClose).toHaveBeenCalledTimes(1);
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(drawer.onClose).toHaveBeenCalledTimes(2);
});

it("animates out when the logical state closes and re-hides the layer", async () => {
  const drawer = await renderDrawer(false);
  await drawer.setOpen(true);
  expect(drawer.ref.current?.progressPx()).toBe(PANEL_WIDTH);
  await drawer.setOpen(false);
  await act(async () => {});
  const layer = host.querySelector<HTMLElement>("[data-mobile-drawer='right']")!;
  expect(drawer.ref.current?.progressPx()).toBe(0);
  expect(layer.getAttribute("aria-hidden")).toBe("true");
  expect(layer.hasAttribute("inert")).toBe(true);
  expect(layer.style.visibility).toBe("hidden");
});
