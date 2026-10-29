/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useDesktopHeaderLayout } from "./useDesktopHeaderLayout";
import { AGENT_WEBCLIENT_HEADER_LAYOUT_GLOBAL, type AgentWebclientHeaderLayoutSnapshot } from "@/shared/contracts/generated/agentWebclientBridge";

const value = (revision: number, collapsed = true): AgentWebclientHeaderLayoutSnapshot => ({
  schemaVersion: "1.0", revision, sidebarCollapsed: collapsed, headerLeftInset: collapsed ? 128 : 0,
});
let root: Root;
let container: HTMLDivElement;
let current: AgentWebclientHeaderLayoutSnapshot | null;
let listeners: Set<(snapshot: unknown) => void>;
function Probe({ enabled = true }: { enabled?: boolean }) {
  const layout = useDesktopHeaderLayout(enabled);
  return <nav data-collapsed={String(layout.sidebarCollapsed)} style={{ paddingLeft: layout.headerLeftInset }}><input defaultValue="draft" /></nav>;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState({}, "", "/agent/a?desktopSidebarCollapsed=1&desktopHeaderLeftInset=128");
  current = value(1);
  listeners = new Set();
  Object.defineProperty(window, AGENT_WEBCLIENT_HEADER_LAYOUT_GLOBAL, { configurable: true, value: {
    version: "1.0", getSnapshot: () => current,
    subscribe(listener: (snapshot: unknown) => void) { listeners.add(listener); return () => listeners.delete(listener); },
  } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Reflect.deleteProperty(window, AGENT_WEBCLIENT_HEADER_LAYOUT_GLOBAL);
});
function publish(snapshot: unknown) { act(() => { for (const listener of listeners) listener(snapshot); }); }

it("uses bootstrap spacing and applies live host changes without remounting content or navigating", () => {
  act(() => root.render(<Probe />));
  expect(container.querySelector("nav")!.style.paddingLeft).toBe("128px");
  const input = container.querySelector("input")!;
  input.value = "unsent draft";
  const url = window.location.href;
  publish(value(2, false));
  expect(container.querySelector("nav")!.style.paddingLeft).toBe("0px");
  publish(value(3));
  expect(container.querySelector("nav")!.style.paddingLeft).toBe("128px");
  expect(container.querySelector("input")).toBe(input);
  expect(input.value).toBe("unsent draft");
  expect(window.location.href).toBe(url);
});

it("rejects stale or oversized snapshots and clears revoked layout", () => {
  act(() => root.render(<Probe />));
  publish(value(4, false));
  publish(value(3));
  publish(value(4));
  publish({ ...value(5), headerLeftInset: 10000 });
  expect(container.querySelector("nav")!.style.paddingLeft).toBe("0px");
  publish(value(5));
  expect(container.querySelector("nav")!.style.paddingLeft).toBe("128px");
  publish(null);
  expect(container.querySelector("nav")!.style.paddingLeft).toBe("0px");
});

it("leaves Standalone and non-agent surfaces unchanged and releases subscribers", () => {
  act(() => root.render(<Probe enabled={false} />));
  expect(container.querySelector("nav")!.style.paddingLeft).toBe("0px");
  expect(listeners.size).toBe(0);
  act(() => root.render(<Probe />));
  expect(listeners.size).toBe(1);
  act(() => root.render(<Probe enabled={false} />));
  expect(listeners.size).toBe(0);
});
