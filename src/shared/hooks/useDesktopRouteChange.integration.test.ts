/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TextDecoder, TextEncoder } from "util";
import type { DesktopRouteChangedPayload } from "./useDesktopRouteChange";

Object.assign(globalThis, { TextDecoder, TextEncoder });

if (typeof globalThis.Request === "undefined") {
  class TestRequest {
    readonly url: string;
    readonly method: string;
    readonly signal?: AbortSignal;

    constructor(input: string | URL | { url: string }, init?: RequestInit) {
      this.url = typeof input === "string" || input instanceof URL
        ? String(input)
        : input.url;
      this.method = init?.method || "GET";
      this.signal = init?.signal || undefined;
    }
  }
  Object.assign(globalThis, { Request: TestRequest });
}

const {
  createBrowserRouter,
  RouterProvider,
  useLocation,
} = require("react-router-dom") as typeof import("react-router-dom");
const {
  PAGE_TO_PRELOAD_ROUTE_STATUS_EVENT,
  resetDesktopRouteChangeBridgeForTests,
  SERVICE_WEBVIEW_BRIDGE_ROUTE_CHANNEL,
  useDesktopRouteChange,
} = require("./useDesktopRouteChange") as typeof import("./useDesktopRouteChange");

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

type RouteCallback = (
  event: unknown,
  payload: DesktopRouteChangedPayload,
) => void;

const RouterProbe = () => {
  useDesktopRouteChange();
  const location = useLocation();
  const routerLocation = `${location.pathname}${location.search}${location.hash}`;
  const targetChatId = new URLSearchParams(location.search).get("chatId") || "";
  return React.createElement(
    "main",
    { "data-router-location": routerLocation },
    targetChatId === "chat-b"
      ? React.createElement("div", { className: "history-skeleton" }, "loading")
      : targetChatId,
  );
};

describe("useDesktopRouteChange browser Router integration", () => {
  const originalElectronAPI = (window as Window & { electronAPI?: unknown })
    .electronAPI;
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    window.history.replaceState({}, "", "/agent/demo?chatId=chat-a");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    resetDesktopRouteChangeBridgeForTests();
    if (originalElectronAPI === undefined) {
      Reflect.deleteProperty(window, "electronAPI");
    } else {
      Object.defineProperty(window, "electronAPI", {
        configurable: true,
        writable: true,
        value: originalElectronAPI,
      });
    }
    window.history.replaceState({}, "", "/");
  });

  it("commits Router DOM synchronously and applies only the exact revision", () => {
    const callbacks: RouteCallback[] = [];
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      writable: true,
      value: {
        onFromMain: (channel: string, callback: RouteCallback) => {
          expect(channel).toBe(SERVICE_WEBVIEW_BRIDGE_ROUTE_CHANNEL);
          callbacks.push(callback);
          return () => undefined;
        },
      },
    });
    const statuses: unknown[] = [];
    const statusListener = (event: Event) => {
      statuses.push((event as CustomEvent<unknown>).detail);
    };
    window.addEventListener(PAGE_TO_PRELOAD_ROUTE_STATUS_EVENT, statusListener);
    const router = createBrowserRouter([{
      path: "*",
      element: React.createElement(RouterProbe),
    }]);

    act(() => root.render(React.createElement(RouterProvider, { router })));
    expect(statuses[0]).toEqual({
      type: "desktopRouteReady",
      routerLocation: "/agent/demo?chatId=chat-a",
    });
    statuses.length = 0;
    const historyLength = window.history.length;

    act(() => {
      callbacks[0]?.({}, {
        type: "desktopRouteChanged",
        pathname: "/agent/demo",
        search: "?chatId=chat-b",
        routeRevision: 41,
      });
    });

    expect(
      container.querySelector("main")?.getAttribute("data-router-location"),
    ).toBe("/agent/demo?chatId=chat-b");
    expect(container.querySelector(".history-skeleton")).not.toBeNull();
    expect(window.history.length).toBe(historyLength);
    expect(statuses).toEqual([{
      type: "desktopRouteApplied",
      routeRevision: 41,
      routerLocation: "/agent/demo?chatId=chat-b",
    }]);

    window.removeEventListener(PAGE_TO_PRELOAD_ROUTE_STATUS_EVENT, statusListener);
  });

  it("re-announces READY after a StrictMode remount and still consumes the latest command", () => {
    const callbacks: RouteCallback[] = [];
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      writable: true,
      value: {
        onFromMain: (_channel: string, callback: RouteCallback) => {
          callbacks.push(callback);
          return () => undefined;
        },
      },
    });
    const statuses: unknown[] = [];
    const statusListener = (event: Event) => {
      statuses.push((event as CustomEvent<unknown>).detail);
    };
    window.addEventListener(PAGE_TO_PRELOAD_ROUTE_STATUS_EVENT, statusListener);
    const router = createBrowserRouter([{
      path: "*",
      element: React.createElement(RouterProbe),
    }]);

    act(() => root.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(RouterProvider, { router }),
      ),
    ));

    expect(statuses.filter((status) =>
      (status as { type?: unknown }).type === "desktopRouteReady"
    ).length).toBeGreaterThanOrEqual(1);
    expect(callbacks).toHaveLength(1);
    statuses.length = 0;

    act(() => {
      callbacks[0]?.({}, {
        type: "desktopRouteChanged",
        pathname: "/agent/demo",
        search: "?chatId=chat-b",
        routeRevision: 42,
      });
    });

    expect(
      container.querySelector("main")?.getAttribute("data-router-location"),
    ).toBe("/agent/demo?chatId=chat-b");
    expect(statuses).toContainEqual({
      type: "desktopRouteApplied",
      routeRevision: 42,
      routerLocation: "/agent/demo?chatId=chat-b",
    });
    window.removeEventListener(PAGE_TO_PRELOAD_ROUTE_STATUS_EVENT, statusListener);
  });
});
