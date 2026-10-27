/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RunActivityIcon, type RunActivityIconProps } from "./RunActivityIcon";
import { RUN_ACTIVITY_EXPRESSIONS, resolveRunActivityAppearance, type RunActivityVariant } from "../lib/runActivityAppearance";

jest.mock("@/shared/icons/AgentCharacter.module.css", () => ({ __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }));
let root: Root;
let container: HTMLDivElement;
let reduced: boolean;
let hidden: boolean;
let motionChange: () => void;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  jest.useFakeTimers();
  jest.spyOn(Math, "random").mockReturnValue(0.5);
  reduced = false; hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({
    get matches() { return reduced; },
    addEventListener: (_: string, callback: () => void) => { motionChange = callback; },
    removeEventListener: jest.fn(),
  }) });
  container = document.createElement("div"); root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  expect(jest.getTimerCount()).toBe(0);
  jest.restoreAllMocks(); jest.useRealTimers();
  Reflect.deleteProperty(document, "hidden"); Reflect.deleteProperty(window, "matchMedia");
});
function render(props: RunActivityIconProps = {}) {
  act(() => root.render(<React.StrictMode><RunActivityIcon {...props} /></React.StrictMode>));
}
function advance(ms: number) { act(() => jest.advanceTimersByTime(ms)); }
function expression() { return container.querySelector("[data-expression]")?.getAttribute("data-expression"); }

it("performs multiple short gestures without restarting the long expression or message rerenders", () => {
  render();
  const clock = container.querySelector(".expression-cycle");
  expect(expression()).toBe("curious");
  advance(1525);
  expect(container.querySelector("[data-gesture='1']")).not.toBeNull();
  expect(container.querySelector(".expression-cycle")).toBe(clock);
  render(); advance(1575);
  expect(container.querySelector("[data-gesture='2']")).not.toBeNull();
  expect(container.querySelector(".expression-cycle")).toBe(clock);
  advance(3249); expect(expression()).toBe("curious");
  advance(1); expect(expression()).toBe("reading");
  expect(container.querySelector(".expression-cycle")).not.toBe(clock);
  expect(jest.getTimerCount()).toBe(1);
});
it("stops scheduling for reduced motion and resumes when the preference changes", () => {
  reduced = true; render(); expect(jest.getTimerCount()).toBe(0);
  reduced = false; act(() => motionChange()); expect(jest.getTimerCount()).toBe(1);
  reduced = true; act(() => motionChange()); expect(jest.getTimerCount()).toBe(0);
});
it("suspends both clocks while hidden and preserves the remaining expression on return", () => {
  render(); advance(1000);
  hidden = true; act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(jest.getTimerCount()).toBe(0); advance(10_000);
  hidden = false; act(() => document.dispatchEvent(new Event("visibilitychange")));
  advance(5349); expect(expression()).toBe("curious");
  advance(1); expect(expression()).toBe("reading");
});
it("retains all 132 colored role/expression combinations, including explicit static rendering", () => {
  const variants: RunActivityVariant[] = ["general", "code", "knowledge", "team", "agent", "executor"];
  expect(RUN_ACTIVITY_EXPRESSIONS).toHaveLength(22);
  for (const variant of variants) for (const { id } of RUN_ACTIVITY_EXPRESSIONS) {
    render({ variant, expression: id, animated: false, color: "#e34270" });
    expect(expression()).toBe(id);
    expect((container.firstChild as HTMLElement).style.color).toBe("rgb(227, 66, 112)");
    expect(container.querySelector("svg")).not.toBeNull();
    expect(jest.getTimerCount()).toBe(0);
    for (const node of container.querySelectorAll("svg [fill], svg [stroke]")) {
      if (node.closest("mask")) continue;
      for (const key of ["fill", "stroke"]) {
        if (node.hasAttribute(key)) expect(["none", "currentColor"]).toContain(node.getAttribute(key));
      }
    }
  }
});
it("inherits external colors unless explicitly overridden", () => {
  render({ animated: false, style: { color: "purple" } });
  expect((container.firstChild as HTMLElement).style.color).toBe("purple");
  render({ animated: false }); expect((container.firstChild as HTMLElement).style.color).toBe("");
});
it("keeps only the outer half of the two team companions and uses unique transparent masks", () => {
  render({ variant: "team", animated: false });
  const companions = container.querySelectorAll(".companion");
  expect(companions).toHaveLength(2);
  expect(companions[0].firstElementChild?.getAttribute("d")).toBe("M58 56 C34 82 32 120 56 144");
  expect(companions[1].firstElementChild?.getAttribute("d")).toBe("M142 56 C166 82 168 120 144 144");
  expect(container.querySelector("mask")).not.toBeNull();
});
it("renders short resting eyes for discovery and growing round eyes as a distinct expression", () => {
  render({ expression: "surprise", animated: false });
  expect(container.querySelectorAll(".surprise-eye")).toHaveLength(2);
  expect(container.querySelector(".surprise-eye")?.getAttribute("height")).toBe("26");
  render({ expression: "round", animated: false });
  expect(container.querySelectorAll(".round-eye")).toHaveLength(2);
});
it.each([
  ["agent", "M65 53 H39 V84 M135 147 H161 V116"],
  ["executor", "M57 55 L35 145 M165 55 L143 145"],
] as const)("uses the latest %s outline", (variant, outline) => {
  render({ variant, animated: false });
  expect(container.querySelector(".expression-cycle > path")?.getAttribute("d")).toBe(outline);
});
it.each([
  ["GENERAL", "general"], ["REACT", "general"], ["CODER", "code"], ["KBASE", "knowledge"],
  ["TEAM", "team"], ["PROXY", "agent"], ["EXECUTOR", "executor"], ["unknown", "general"],
])("maps resolved %s mode to the %s silhouette and retains the configured icon color", (mode, variant) => {
  expect(resolveRunActivityAppearance({ mode, icon: { color: "#36a280" } })).toEqual({ variant, color: "#36a280" });
});

it("keeps activity silhouette aligned with the configured icon instead of execution mode", () => {
  expect(resolveRunActivityAppearance({ mode: "CODER", icon: { name: "proxy", color: "#358e8a" } }))
    .toEqual({ variant: "agent", color: "#358e8a" });
});
