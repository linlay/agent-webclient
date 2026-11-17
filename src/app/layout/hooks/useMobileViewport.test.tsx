/** @jest-environment jsdom */
import React, { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useMobileViewport } from "./useMobileViewport";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
let viewport: EventTarget & { height: number; pageTop: number; offsetTop: number; scale: number };
const originalViewport = window.visualViewport;
function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  useMobileViewport(ref);
  return <div ref={ref}><textarea /></div>;
}
const flush = () => act(() => { jest.advanceTimersByTime(20); });
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(window, "requestAnimationFrame").mockImplementation(callback => window.setTimeout(() => callback(0), 16));
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(id => window.clearTimeout(id));
  viewport = Object.assign(new EventTarget(), { height: 844, pageTop: 0, offsetTop: 0, scale: 1 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  Object.defineProperty(window, "visualViewport", { configurable: true, value: originalViewport });
  jest.useRealTimers();
  jest.restoreAllMocks();
});
it("tracks keyboard height and document panning independently of the fixed viewport offset", () => {
  act(() => root.render(<Harness />));
  const shell = host.firstElementChild as HTMLElement;
  expect(shell.style.getPropertyValue("--mobile-height")).toBe("844px");
  viewport.height = 430;
  viewport.pageTop = 180;
  viewport.offsetTop = 60;
  viewport.dispatchEvent(new Event("resize"));
  flush();
  expect(shell.style.getPropertyValue("--mobile-height")).toBe("430px");
  expect(shell.style.getPropertyValue("--mobile-top")).toBe("180px");
  viewport.height = 844;
  viewport.pageTop = 0;
  viewport.dispatchEvent(new Event("scroll"));
  flush();
  expect(shell.style.getPropertyValue("--mobile-top")).toBe("0px");
  expect(shell.style.getPropertyValue("--mobile-height")).toBe("844px");
});
it("accounts for the containing block and samples again after keyboard animation without another resize", () => {
  act(() => root.render(<Harness />));
  const shell = host.firstElementChild as HTMLElement;
  Object.defineProperty(shell, "offsetParent", { value: host });
  jest.spyOn(host, "getBoundingClientRect").mockReturnValue({ top: 30 } as DOMRect);
  shell.querySelector("textarea")!.focus();
  flush();
  viewport.height = 390;
  viewport.pageTop = 120;
  act(() => { jest.advanceTimersByTime(400); });
  expect(shell.style.getPropertyValue("--mobile-height")).toBe("390px");
  expect(shell.style.getPropertyValue("--mobile-top")).toBe("90px");
  act(() => root.unmount());
  expect(jest.getTimerCount()).toBe(0);
});
it("falls back to window dimensions when VisualViewport is unavailable", () => {
  Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
  act(() => root.render(<Harness />));
  const shell = host.firstElementChild as HTMLElement;
  expect(shell.style.getPropertyValue("--mobile-height")).toBe(`${window.innerHeight}px`);
  expect(shell.style.getPropertyValue("--mobile-top")).toBe("0px");
});
it("restores the safe area when the keyboard closes with focus retained, and ignores pinch zoom", () => {
  jest.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(844);
  act(() => root.render(<Harness />));
  const shell = host.firstElementChild as HTMLElement;
  shell.querySelector("textarea")!.focus();
  viewport.height = 430;
  viewport.dispatchEvent(new Event("resize"));
  flush();
  expect(shell.hasAttribute("data-keyboard-open")).toBe(true);
  viewport.height = 844;
  viewport.dispatchEvent(new Event("resize"));
  flush();
  expect(document.activeElement).toBe(shell.querySelector("textarea"));
  expect(shell.hasAttribute("data-keyboard-open")).toBe(false);
  viewport.height = 422;
  viewport.scale = 2;
  viewport.dispatchEvent(new Event("resize"));
  flush();
  expect(shell.hasAttribute("data-keyboard-open")).toBe(false);
});

it.each([
  { mode: "resizes-visual", layoutHeight: 844, scrollY: 180, pageTop: 180 },
  { mode: "resizes-content", layoutHeight: 430, scrollY: 0, pageTop: 0 },
])("does not subtract keyboard height twice in Android $mode", ({ layoutHeight, scrollY, pageTop }) => {
  act(() => root.render(<Harness />));
  const shell = host.firstElementChild as HTMLElement;
  Object.defineProperty(shell, "offsetParent", { value: host });
  jest.spyOn(host, "getBoundingClientRect").mockImplementation(() => ({ top: -window.scrollY } as DOMRect));
  jest.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(layoutHeight);
  jest.replaceProperty(window, "innerHeight", layoutHeight);
  jest.replaceProperty(window, "scrollY", scrollY);
  viewport.height = 430;
  viewport.pageTop = pageTop;
  viewport.offsetTop = 0;
  // Browsers can dispatch both events for the same keyboard animation.
  window.dispatchEvent(new Event("resize"));
  viewport.dispatchEvent(new Event("resize"));
  viewport.dispatchEvent(new Event("scroll"));
  flush();
  expect(shell.style.getPropertyValue("--mobile-height")).toBe("430px");
  expect(shell.style.getPropertyValue("--mobile-top")).toBe(`${pageTop}px`);
  jest.replaceProperty(window, "innerHeight", 844);
  jest.replaceProperty(window, "scrollY", 0);
  viewport.height = 844;
  viewport.pageTop = 0;
  window.dispatchEvent(new Event("resize"));
  viewport.dispatchEvent(new Event("resize"));
  flush();
  expect(shell.style.getPropertyValue("--mobile-height")).toBe("844px");
  expect(shell.style.getPropertyValue("--mobile-top")).toBe("0px");
});
