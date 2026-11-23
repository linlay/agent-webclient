/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useMobileViewportLock } from "./useMobileViewportLock";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const INITIAL = "width=device-width, initial-scale=1.0, interactive-widget=resizes-content";
let meta: HTMLMetaElement;
let host: HTMLDivElement;
let root: Root | null;

function Harness() {
  useMobileViewportLock();
  return null;
}

function touchMove(fingerCount: number) {
  const event = new Event("touchmove", { cancelable: true });
  Object.defineProperty(event, "touches", { value: Array.from({ length: fingerCount }, () => ({})) });
  document.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  meta = document.createElement("meta");
  meta.name = "viewport";
  meta.content = INITIAL;
  document.head.append(meta);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  meta.remove();
});

it("declares the locked mobile viewport without duplicating fields", () => {
  act(() => root?.render(<Harness />));
  const fields = meta.content.split(",").map(field => field.trim());
  for (const field of ["viewport-fit=cover", "interactive-widget=resizes-content", "maximum-scale=1", "user-scalable=no"]) {
    expect(fields.filter(value => value.split("=")[0] === field.split("=")[0])).toEqual([field]);
  }
});

it("cancels pinch zoom and restores the previous viewport after unmount", () => {
  act(() => root?.render(<Harness />));
  expect(touchMove(1).defaultPrevented).toBe(false);
  expect(touchMove(2).defaultPrevented).toBe(true);
  for (const type of ["gesturestart", "gesturechange"]) {
    const gesture = new Event(type, { cancelable: true });
    document.dispatchEvent(gesture);
    expect(gesture.defaultPrevented).toBe(true);
  }

  act(() => root?.unmount());
  root = null;
  expect(meta.content).toBe(INITIAL);
  expect(touchMove(2).defaultPrevented).toBe(false);
});
