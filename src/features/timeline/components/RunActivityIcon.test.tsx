/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RunActivityIcon } from "./RunActivityIcon";

let root: Root;
let container: HTMLDivElement;
let reduced: boolean;
let hidden: boolean;
let motionChange: () => void;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  jest.useFakeTimers();
  jest.spyOn(Math, "random").mockReturnValue(0.5);
  reduced = false;
  hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({
    get matches() { return reduced; },
    addEventListener: (_: string, callback: () => void) => { motionChange = callback; },
    removeEventListener: jest.fn(),
  }) });
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  expect(jest.getTimerCount()).toBe(0);
  jest.restoreAllMocks();
  jest.useRealTimers();
  Reflect.deleteProperty(document, "hidden");
  Reflect.deleteProperty(window, "matchMedia");
});

function render() {
  act(() => root.render(<React.StrictMode><RunActivityIcon /></React.StrictMode>));
}
function expression() { return container.querySelector("[data-expression]")?.getAttribute("data-expression"); }

it("changes face at random intervals and keeps the current animation across message rerenders", () => {
  render();
  expect(expression()).toBe("curious");
  expect(jest.getTimerCount()).toBe(1);
  act(() => jest.advanceTimersByTime(3000));
  render();
  expect(expression()).toBe("curious");
  act(() => jest.advanceTimersByTime(100));
  expect(expression()).toBe("wink");
  expect(jest.getTimerCount()).toBe(1);
  expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
});

it("stops scheduling for reduced motion and resumes when the preference changes", () => {
  reduced = true;
  render();
  expect(jest.getTimerCount()).toBe(0);
  reduced = false;
  act(() => motionChange());
  expect(jest.getTimerCount()).toBe(1);
  reduced = true;
  act(() => motionChange());
  expect(jest.getTimerCount()).toBe(0);
});

it("pauses while the page is hidden and resumes with one timer", () => {
  render();
  hidden = true;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(jest.getTimerCount()).toBe(0);
  act(() => jest.advanceTimersByTime(10000));
  expect(expression()).toBe("curious");
  hidden = false;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  act(() => jest.advanceTimersByTime(3100));
  expect(expression()).toBe("wink");
});
