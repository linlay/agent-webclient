/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RunActivityIcon, type RunActivityIconProps } from "./RunActivityIcon";
import { AGENT_WORK_MOTIONS } from "@/shared/icons/agentMotion";
import { resolveRunActivityAppearance } from "../lib/runActivityAppearance";
import type { RunActivityVariant } from "@/shared/icons/agentCharacterState";

let root: Root, container: HTMLDivElement;
let reduced: boolean, hidden: boolean, motionChange: () => void;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  jest.useFakeTimers(); jest.spyOn(Math, "random").mockReturnValue(.5);
  reduced = false; hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({
    get matches() { return reduced; }, addEventListener: (_: string, callback: () => void) => { motionChange = callback; }, removeEventListener: jest.fn(),
  }) });
  container = document.createElement("div"); root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount()); expect(jest.getTimerCount()).toBe(0);
  jest.restoreAllMocks(); jest.useRealTimers(); Reflect.deleteProperty(document, "hidden"); Reflect.deleteProperty(window, "matchMedia");
});
function render(props: RunActivityIconProps = {}) { act(() => root.render(<React.StrictMode><RunActivityIcon {...props} /></React.StrictMode>)); }
function advance(ms: number) { act(() => jest.advanceTimersByTime(ms)); }
function motion() { return container.querySelector("[data-work-motion]")?.getAttribute("data-work-motion"); }

it("uses only four independent work actions, without repeats or short gesture clocks", () => {
  render({ cycleDurationMs: 4000 }); expect(motion()).toBe("focus");
  const seen = new Set([motion()]);
  for (let i = 0; i < 20; i++) {
    const before = motion(); advance(5999); expect(motion()).toBe(before);
    advance(1); expect(motion()).not.toBe(before); expect(AGENT_WORK_MOTIONS).toContain(motion()); seen.add(motion());
    expect(jest.getTimerCount()).toBe(1);
  }
  expect(seen.size).toBeGreaterThan(1);
  expect(container.querySelector("[data-pointer-tracking]")).toBeNull();
  expect(container.querySelector("[data-agent-action='turn'],[data-agent-action='doze']")).toBeNull();
});
it("does not restart work on message rerenders or respond to pointer movement", () => {
  render({ cycleDurationMs: 4000 }); advance(3000); render({ cycleDurationMs: 4000, color: "red" });
  container.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 200 }));
  advance(2999); expect(motion()).toBe("focus"); advance(1); expect(motion()).toBe("hop");
});
it("keeps each activity clock separate", () => {
  act(() => root.render(<><RunActivityIcon cycleDurationMs={4000} /><RunActivityIcon cycleDurationMs={8000} /></>));
  advance(6000);
  const icons = container.querySelectorAll("[data-work-motion]");
  expect(icons[0].getAttribute("data-work-motion")).toBe("hop");
  expect(icons[1].getAttribute("data-work-motion")).toBe("focus");
});
it("cancels scheduling while hidden or reduced and resumes without catch-up bursts", () => {
  render(); advance(1000); hidden = true;
  act(() => document.dispatchEvent(new Event("visibilitychange"))); expect(jest.getTimerCount()).toBe(0);
  advance(60_000); hidden = false; act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(jest.getTimerCount()).toBe(1); expect(motion()).toBe("focus");
  reduced = true; act(() => motionChange()); expect(jest.getTimerCount()).toBe(0);
  reduced = false; act(() => motionChange()); expect(jest.getTimerCount()).toBe(1);
});
it("starts static under reduced motion and supports explicit static rendering", () => {
  reduced = true; render(); expect(jest.getTimerCount()).toBe(0);
  reduced = false; render({ animated: false }); expect(jest.getTimerCount()).toBe(0);
});
it("supports the four preview actions for every silhouette, with inherited colors", () => {
  for (const variant of ["general", "code", "knowledge", "team", "agent", "executor"] as RunActivityVariant[]) {
    for (const fixed of AGENT_WORK_MOTIONS) {
      render({ variant, motion: fixed, animated: false, color: "#e34270" });
      expect(motion()).toBe(fixed); expect(container.querySelectorAll("[data-agent-eyes]").length).toBe(variant === "team" ? 3 : 1);
      expect((container.firstChild as HTMLElement).style.color).toBe("rgb(227, 66, 112)"); expect(jest.getTimerCount()).toBe(0);
    }
  }
  render({ animated: false, style: { color: "purple" } }); expect((container.firstChild as HTMLElement).style.color).toBe("purple");
});
it.each([
  ["GENERAL", "general"], ["REACT", "general"], ["CODER", "code"], ["KBASE", "knowledge"],
  ["TEAM", "team"], ["PROXY", "agent"], ["EXECUTOR", "executor"], ["unknown", "general"],
])("maps %s mode to %s without replacing an explicit configured icon", (mode, variant) => {
  expect(resolveRunActivityAppearance({ mode, icon: { color: "#36a280" } })).toEqual({ variant, color: "#36a280" });
  expect(resolveRunActivityAppearance({ mode, icon: { name: "proxy", color: "#358e8a" } })).toEqual({ variant: "agent", color: "#358e8a" });
});
