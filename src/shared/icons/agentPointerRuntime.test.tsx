/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AgentIcon } from "./agent";
import type { AgentIconName } from "./agentAppearance";

let root: Root, host: HTMLDivElement;
let now: number, sequence: number, queue: Map<number, FrameRequestCallback>;
let reduced: boolean, hidden: boolean, preferenceChange: () => void;
const oldObserver = window.IntersectionObserver;
const oldSizes = window.ResizeObserver;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  now = 0; sequence = 0; queue = new Map(); reduced = false; hidden = false;
  Object.defineProperty(window, "IntersectionObserver", { configurable: true, value: undefined });
  Object.defineProperty(window, "ResizeObserver", { configurable: true, value: undefined });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({
    get matches() { return reduced; }, addEventListener: (_: string, callback: () => void) => { preferenceChange = callback; }, removeEventListener: jest.fn(),
  }) });
  jest.spyOn(window.performance, "now").mockImplementation(() => now);
  jest.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { queue.set(++sequence, callback); return sequence; });
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { queue.delete(id); });
  jest.spyOn(SVGElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
    left: 100, top: 100, width: 40, height: 40, right: 140, bottom: 140, x: 100, y: 100, toJSON: () => ({}),
  }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount()); expect(queue.size).toBe(0); host.remove(); jest.restoreAllMocks();
  Reflect.deleteProperty(document, "hidden"); Reflect.deleteProperty(window, "matchMedia");
  Object.defineProperty(window, "IntersectionObserver", { configurable: true, value: oldObserver });
  Object.defineProperty(window, "ResizeObserver", { configurable: true, value: oldSizes });
});
function render(names: AgentIconName[] = ["general"], options: { surface?: boolean; disabled?: boolean } = {}) {
  act(() => root.render(<React.StrictMode><div data-agent-pointer-surface={options.surface ? "" : undefined}>
    {names.map(name => <button key={name} data-agent-identity="" aria-label={name}>
      <AgentIcon type="agent" icon={{ name, color: "#4370b4" }} interactive={!options.disabled} />{name}
    </button>)}<span id="surface-target">Surface content</span>
  </div></React.StrictMode>));
}
function frames(count: number) {
  act(() => { for (let index = 0; index < count; index++) { now += 16.67; const pending = [...queue.values()]; queue.clear(); pending.forEach(callback => callback(now)); } });
}
function move(x = 200, y = 117, target: EventTarget = document) {
  act(() => target.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: y })));
}
function icon() { return host.querySelector<SVGSVGElement>("[data-agent-avatar]")!; }

it("shares one frame, follows nearby pointer positions and preserves exact defaults after leaving", () => {
  const add = jest.spyOn(document, "addEventListener");
  render(["general", "coder", "kbase", "team"]);
  expect(queue.size).toBe(0);
  // StrictMode mounts, cleans up, then installs one shared listener set.
  expect(add.mock.calls.filter(([type]) => type === "pointermove")).toHaveLength(2);
  const shape = icon().querySelector("[data-agent-gaze] rect")!;
  const base = ["x", "y", "width", "height", "rx"].map(key => shape.getAttribute(key));
  move(); expect(queue.size).toBe(1); frames(30);
  expect(icon().dataset.pointerMood).toBe("side");
  expect(icon().querySelector("[data-agent-gaze]")?.getAttribute("transform")).not.toBe("translate(0 0)");
  expect(icon().style.color).toBe("rgb(67, 112, 180)");
  act(() => document.dispatchEvent(new MouseEvent("pointerout", { relatedTarget: null })));
  frames(180);
  expect(icon().dataset.pointerMood).toBe("rest");
  expect(icon().querySelector("[data-agent-gaze]")?.getAttribute("transform")).toBeNull();
  expect(["x", "y", "width", "height", "rx"].map(key => shape.getAttribute(key))).toEqual(base);
  expect(queue.size).toBe(0);
});
it("does not constantly measure layout while following", () => {
  render(); move(); frames(30);
  const measure = SVGElement.prototype.getBoundingClientRect as jest.Mock;
  expect(measure).toHaveBeenCalledTimes(1);
  move(210); frames(30); expect(measure).toHaveBeenCalledTimes(1);
  act(() => window.dispatchEvent(new Event("resize"))); frames(1); expect(measure).toHaveBeenCalledTimes(2);
});
it("greets briefly at the face then opens round eyes instead of keeping an eye shut", () => {
  render(); move(120); frames(8); expect(icon().dataset.pointerMood).toBe("wink");
  frames(50); expect(icon().dataset.pointerMood).toBe("round");
});
it("activates over the name and explicitly declared surface even outside the nearby radius", () => {
  render(); move(900, 900, host.querySelector("button")!); frames(10);
  expect(icon().dataset.pointerMood).not.toBe("rest");
  render(["general"], { surface: true });
  move(900, 900, host.querySelector("#surface-target")!); frames(10);
  expect(icon().dataset.pointerMood).not.toBe("rest");
});
it("resets immediately when hidden or reduced motion is enabled", () => {
  render(); move(); frames(12);
  hidden = true; act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(queue.size).toBe(0); expect(icon().dataset.pointerMood).toBe("rest");
  hidden = false; act(() => document.dispatchEvent(new Event("visibilitychange")));
  move(); frames(12); reduced = true; act(() => preferenceChange());
  expect(queue.size).toBe(0); expect(icon().dataset.pointerMood).toBe("rest");
  move(); expect(queue.size).toBe(0);
});
it("supports keyboard focus and a short touch response without permanent hover", () => {
  render(); act(() => host.querySelector("button")!.focus()); frames(8);
  expect(icon().dataset.pointerMood).toBe("think");
  act(() => host.querySelector("button")!.blur()); frames(150);
  const touch = new MouseEvent("pointerdown", { bubbles: true, clientX: 120, clientY: 117 });
  Object.defineProperty(touch, "pointerType", { value: "touch" });
  act(() => icon().dispatchEvent(touch)); frames(8); expect(icon().dataset.pointerMood).toBe("wink");
  frames(200); expect(icon().dataset.pointerMood).toBe("rest"); expect(queue.size).toBe(0);
});
it("keeps executor/proxy and explicitly static avatars out of the pointer runtime", () => {
  render(["executor", "proxy"]); move(); frames(1);
  expect(host.querySelector("[data-pointer-tracking]")).toBeNull(); expect(queue.size).toBe(0);
  render(["general"], { disabled: true }); move(); frames(1);
  expect(icon().hasAttribute("data-pointer-tracking")).toBe(false);
});
it("leaves exported avatars static when a containing surface disables pointer feedback", () => {
  act(() => root.render(<main data-agent-pointer-disabled=""><AgentIcon type="agent" icon={{ name: "general" }} /></main>));
  move(); frames(1); expect(icon().hasAttribute("data-pointer-tracking")).toBe(false); expect(queue.size).toBe(0);
});

it("skips offscreen avatars and resumes tracking when intersection changes", () => {
  let deliver!: (entries: Partial<IntersectionObserverEntry>[]) => void;
  class Observer {
    constructor(callback: (entries: Partial<IntersectionObserverEntry>[]) => void) { deliver = callback; }
    observe() {} unobserve() {} disconnect() {}
  }
  Object.defineProperty(window, "IntersectionObserver", { configurable: true, value: Observer });
  render(); move(); frames(2);
  expect(icon().dataset.pointerMood).toBe("rest"); expect(queue.size).toBe(0);
  deliver([{ target: icon(), isIntersecting: true }]); frames(15);
  expect(icon().dataset.pointerMood).toBe("side");
  deliver([{ target: icon(), isIntersecting: false }]); frames(2);
  expect(icon().dataset.pointerMood).toBe("rest"); expect(queue.size).toBe(0);
});

it("refreshes cached positions when an identity group changes size", () => {
  let changed!: () => void;
  class Sizes {
    constructor(callback: () => void) { changed = callback; }
    observe() {} unobserve() {} disconnect() {}
  }
  Object.defineProperty(window, "ResizeObserver", { configurable: true, value: Sizes });
  render(); move(); frames(15);
  const measure = SVGElement.prototype.getBoundingClientRect as jest.Mock;
  expect(measure).toHaveBeenCalledTimes(1);
  changed(); frames(1); expect(measure).toHaveBeenCalledTimes(2);
});

it("keeps the new default eye geometry when the configured icon changes during tracking", () => {
  const update = (name: AgentIconName) => act(() => root.render(<button data-agent-identity="">
    <AgentIcon type="agent" icon={{ name }} />
  </button>));
  update("general"); move(); frames(20);
  update("coder");
  const shape = icon().querySelector("[data-agent-gaze] rect")!;
  expect(["x", "y", "width", "height"].map(key => shape.getAttribute(key))).toEqual(["74", "79", "14", "25"]);
  expect(icon().dataset.agentIconName).toBe("coder");
});
