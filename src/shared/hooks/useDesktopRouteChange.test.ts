/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLocation, useNavigate } from "react-router-dom";
import {
  buildDesktopRouteTarget,
  buildRouterLocationTarget,
  PAGE_TO_PRELOAD_ROUTE_STATUS_EVENT,
  resetDesktopRouteChangeBridgeForTests,
  SERVICE_WEBVIEW_BRIDGE_ROUTE_CHANNEL,
  subscribeDesktopRouteChanges,
  type DesktopRouteChangedPayload,
  useDesktopRouteChange,
} from "./useDesktopRouteChange";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("react-router-dom", () => ({
  useLocation: jest.fn(),
  useNavigate: jest.fn(),
}));

type RouteCallback = (
  event: unknown,
  payload: DesktopRouteChangedPayload,
) => void;

function installMockWindow(onFromMain: jest.Mock): void {
  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    writable: true,
    value: {
      onFromMain,
    },
  });
  window.history.replaceState({}, "", "/agent/current");
}

const useLocationMock = useLocation as jest.Mock;
const useNavigateMock = useNavigate as jest.Mock;

const HookProbe = () => {
  useDesktopRouteChange();
  return null;
};

describe("useDesktopRouteChange bridge", () => {
  const originalElectronAPI = (window as Window & { electronAPI?: unknown })
    .electronAPI;
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    container?.remove();
    container = null;
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
    jest.clearAllMocks();
  });

  function renderHookProbe(): void {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(React.createElement(HookProbe)));
  }

  function rerenderHookProbe(): void {
    act(() => root?.render(React.createElement(HookProbe)));
  }

  it("normalizes desktop route payloads into router targets", () => {
    expect(
      buildDesktopRouteTarget({
        pathname: "/agent/demo?chatId=chat_1#events",
      }),
    ).toBe("/agent/demo?chatId=chat_1#events");
    expect(
      buildDesktopRouteTarget({
        pathname: "copilot/demo",
        search: "chatId=chat_2",
        hash: "timeline",
      }),
    ).toBe("/copilot/demo?chatId=chat_2#timeline");
    expect(
      buildDesktopRouteTarget({
        pathname: "/agent/demo?chatId=from_path#path_hash",
        search: "?chatId=from_payload",
        hash: "#payload_hash",
      }),
    ).toBe("/agent/demo?chatId=from_payload#payload_hash");
    expect(buildRouterLocationTarget({
      pathname: "/agent/demo",
      search: "?newChat=1788308765045",
      hash: "#timeline",
    })).toBe("/agent/demo?newChat=1788308765045#timeline");
    expect(buildDesktopRouteTarget({ pathname: "//example.test/chat" })).toBeNull();
    expect(buildDesktopRouteTarget({ pathname: "/agent\\demo" })).toBeNull();
    expect(buildDesktopRouteTarget({
      pathname: "/agent/demo",
      search: "?chatId=bad\u0000value",
    })).toBeNull();
    expect(buildDesktopRouteTarget({
      pathname: `/${"a".repeat(8_192)}`,
    })).toBeNull();
  });

  it("navigates when the physical URL is current but React Router is stale", () => {
    const callbacks: RouteCallback[] = [];
    const onFromMain = jest.fn((_channel: string, callback: RouteCallback) => {
      callbacks.push(callback);
    });
    const navigate = jest.fn();
    const statuses: unknown[] = [];
    installMockWindow(onFromMain);
    window.history.replaceState(
      {},
      "",
      "/agent/cutej?newChat=1788308765045",
    );
    useNavigateMock.mockReturnValue(navigate);
    useLocationMock.mockReturnValue({
      pathname: "/agent/bootstrap",
      search: "?chatId=bootstrap-chat",
      hash: "",
    });
    const statusListener = (event: Event) => {
      statuses.push((event as CustomEvent<unknown>).detail);
    };
    window.addEventListener(PAGE_TO_PRELOAD_ROUTE_STATUS_EVENT, statusListener);
    renderHookProbe();
    statuses.length = 0;

    act(() => {
      callbacks[0]?.({}, {
        type: "desktopRouteChanged",
        pathname: "/agent/cutej",
        search: "?newChat=1788308765045",
        routeRevision: 7,
      });
    });

    expect(window.location.pathname).toBe("/agent/cutej");
    expect(navigate).toHaveBeenCalledWith(
      "/agent/cutej?newChat=1788308765045",
      { replace: true, flushSync: true },
    );
    expect(statuses).toEqual([]);

    useLocationMock.mockReturnValue({
      pathname: "/agent/cutej",
      search: "?newChat=1788308765045",
      hash: "",
    });
    rerenderHookProbe();

    expect(statuses).toEqual([{
      type: "desktopRouteApplied",
      routeRevision: 7,
      routerLocation: "/agent/cutej?newChat=1788308765045",
    }]);
    window.removeEventListener(PAGE_TO_PRELOAD_ROUTE_STATUS_EVENT, statusListener);
  });

  it("ignores a duplicate payload only when React Router already matches", () => {
    const callbacks: RouteCallback[] = [];
    const onFromMain = jest.fn((_channel: string, callback: RouteCallback) => {
      callbacks.push(callback);
    });
    const navigate = jest.fn();
    const statuses: unknown[] = [];
    installMockWindow(onFromMain);
    useNavigateMock.mockReturnValue(navigate);
    useLocationMock.mockReturnValue({
      pathname: "/agent/cutej",
      search: "?newChat=1788308765045",
      hash: "",
    });
    const statusListener = (event: Event) => {
      statuses.push((event as CustomEvent<unknown>).detail);
    };
    window.addEventListener(PAGE_TO_PRELOAD_ROUTE_STATUS_EVENT, statusListener);
    renderHookProbe();
    statuses.length = 0;

    act(() => {
      callbacks[0]?.({}, {
        type: "desktopRouteChanged",
        pathname: "/agent/cutej",
        search: "?newChat=1788308765045",
        routeRevision: 8,
      });
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(statuses).toEqual([{
      type: "desktopRouteApplied",
      routeRevision: 8,
      routerLocation: "/agent/cutej?newChat=1788308765045",
    }]);
    window.removeEventListener(PAGE_TO_PRELOAD_ROUTE_STATUS_EVENT, statusListener);
  });

  it("rejects Main Chat route payloads without a positive revision", () => {
    const callbacks: RouteCallback[] = [];
    const onFromMain = jest.fn((_channel: string, callback: RouteCallback) => {
      callbacks.push(callback);
    });
    const navigate = jest.fn();
    const statuses: unknown[] = [];
    installMockWindow(onFromMain);
    useNavigateMock.mockReturnValue(navigate);
    useLocationMock.mockReturnValue({
      pathname: "/agent/current",
      search: "",
      hash: "",
    });
    const statusListener = (event: Event) => {
      statuses.push((event as CustomEvent<unknown>).detail);
    };
    window.addEventListener(PAGE_TO_PRELOAD_ROUTE_STATUS_EVENT, statusListener);
    renderHookProbe();
    statuses.length = 0;

    act(() => {
      callbacks[0]?.({}, {
        type: "desktopRouteChanged",
        pathname: "/agent/cutej",
      });
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(statuses).toEqual([]);
    window.removeEventListener(PAGE_TO_PRELOAD_ROUTE_STATUS_EVENT, statusListener);
  });

  it("reports Router READY only after the shared host listener is registered", () => {
    const callOrder: string[] = [];
    const onFromMain = jest.fn(() => {
      callOrder.push("listener");
      return undefined;
    });
    const statuses: unknown[] = [];
    installMockWindow(onFromMain);
    useNavigateMock.mockReturnValue(jest.fn());
    useLocationMock.mockReturnValue({
      pathname: "/agent/current",
      search: "?chatId=chat-current",
      hash: "",
    });
    window.addEventListener(PAGE_TO_PRELOAD_ROUTE_STATUS_EVENT, (event) => {
      callOrder.push("ready");
      statuses.push((event as CustomEvent<unknown>).detail);
    }, { once: true });

    renderHookProbe();

    expect(callOrder).toEqual(["listener", "ready"]);
    expect(statuses).toEqual([{
      type: "desktopRouteReady",
      routerLocation: "/agent/current?chatId=chat-current",
    }]);
  });

  it("lets the latest A-to-B-to-C revision replace an older pending render", () => {
    const callbacks: RouteCallback[] = [];
    const onFromMain = jest.fn((_channel: string, callback: RouteCallback) => {
      callbacks.push(callback);
    });
    const navigate = jest.fn();
    const statuses: unknown[] = [];
    const statusListener = (event: Event) => {
      statuses.push((event as CustomEvent<unknown>).detail);
    };
    installMockWindow(onFromMain);
    useNavigateMock.mockReturnValue(navigate);
    useLocationMock.mockReturnValue({
      pathname: "/agent/demo",
      search: "?chatId=chat-a",
      hash: "",
    });
    window.addEventListener(PAGE_TO_PRELOAD_ROUTE_STATUS_EVENT, statusListener);
    renderHookProbe();
    statuses.length = 0;

    act(() => {
      callbacks[0]?.({}, {
        type: "desktopRouteChanged",
        pathname: "/agent/demo",
        search: "?chatId=chat-b",
        routeRevision: 9,
      });
      callbacks[0]?.({}, {
        type: "desktopRouteChanged",
        pathname: "/agent/demo",
        search: "?chatId=chat-c",
        routeRevision: 10,
      });
    });

    useLocationMock.mockReturnValue({
      pathname: "/agent/demo",
      search: "?chatId=chat-b",
      hash: "",
    });
    rerenderHookProbe();
    expect(statuses).toEqual([]);

    useLocationMock.mockReturnValue({
      pathname: "/agent/demo",
      search: "?chatId=chat-c",
      hash: "",
    });
    rerenderHookProbe();
    expect(statuses).toEqual([{
      type: "desktopRouteApplied",
      routeRevision: 10,
      routerLocation: "/agent/demo?chatId=chat-c",
    }]);
    expect(navigate).toHaveBeenNthCalledWith(
      1,
      "/agent/demo?chatId=chat-b",
      { replace: true, flushSync: true },
    );
    expect(navigate).toHaveBeenNthCalledWith(
      2,
      "/agent/demo?chatId=chat-c",
      { replace: true, flushSync: true },
    );
    act(() => {
      for (const routeRevision of [9, 10]) {
        callbacks[0]?.({}, {
          type: "desktopRouteChanged", pathname: "/agent/demo",
          search: "?chatId=chat-b", routeRevision,
        });
      }
    });
    expect(navigate).toHaveBeenCalledTimes(2); // Neither stale nor conflicting revision wins.
    expect(statuses).toHaveLength(1);
    window.removeEventListener(PAGE_TO_PRELOAD_ROUTE_STATUS_EVENT, statusListener);
  });

  it("registers the host listener only once for multiple subscribers", () => {
    const callbacks: RouteCallback[] = [];
    const onFromMain = jest.fn((_channel: string, callback: RouteCallback) => {
      callbacks.push(callback);
    });
    installMockWindow(onFromMain);
    const firstTargets: string[] = [];
    const secondTargets: string[] = [];

    subscribeDesktopRouteChanges((target) => firstTargets.push(target));
    subscribeDesktopRouteChanges((target) => secondTargets.push(target));

    expect(onFromMain).toHaveBeenCalledTimes(1);
    expect(onFromMain).toHaveBeenCalledWith(
      SERVICE_WEBVIEW_BRIDGE_ROUTE_CHANNEL,
      expect.any(Function),
    );

    callbacks[0]?.({}, {
      type: "desktopRouteChanged",
      pathname: "/agent/model-mimo",
      routeRevision: 1,
    });

    expect(firstTargets).toEqual(["/agent/model-mimo"]);
    expect(secondTargets).toEqual(["/agent/model-mimo"]);
  });

  it("removes hook subscribers without removing the shared host listener", () => {
    const callbacks: RouteCallback[] = [];
    const onFromMain = jest.fn((_channel: string, callback: RouteCallback) => {
      callbacks.push(callback);
    });
    installMockWindow(onFromMain);
    const firstTargets: string[] = [];
    const secondTargets: string[] = [];
    const unsubscribeFirst = subscribeDesktopRouteChanges((target) =>
      firstTargets.push(target),
    );
    subscribeDesktopRouteChanges((target) => secondTargets.push(target));

    unsubscribeFirst();
    callbacks[0]?.({}, {
      type: "desktopRouteChanged",
      pathname: "/copilot/demo-agent",
      search: "chatId=chat_1",
      routeRevision: 2,
    });

    expect(onFromMain).toHaveBeenCalledTimes(1);
    expect(firstTargets).toEqual([]);
    expect(secondTargets).toEqual(["/copilot/demo-agent?chatId=chat_1"]);
  });

  it("ignores unrelated messages and empty route payloads", () => {
    const callbacks: RouteCallback[] = [];
    const onFromMain = jest.fn((_channel: string, callback: RouteCallback) => {
      callbacks.push(callback);
    });
    installMockWindow(onFromMain);
    const targets: string[] = [];

    subscribeDesktopRouteChanges((target) => targets.push(target));

    callbacks[0]?.({}, {
      type: "desktopContextChanged",
      pathname: "/agent/demo-agent",
    });
    callbacks[0]?.({}, {
      type: "desktopRouteChanged",
      pathname: "",
    });
    (callbacks[0] as unknown as (event: unknown, payload: unknown) => void)?.(
      {},
      null,
    );
    (callbacks[0] as unknown as (event: unknown, payload: unknown) => void)?.(
      {},
      [],
    );

    expect(targets).toEqual([]);
  });

  it("uses a returned host unsubscribe when the preload bridge provides one", () => {
    const unsubscribeFromMain = jest.fn();
    const onFromMain = jest.fn(() => unsubscribeFromMain);
    installMockWindow(onFromMain);

    subscribeDesktopRouteChanges(() => undefined);
    resetDesktopRouteChangeBridgeForTests();

    expect(unsubscribeFromMain).toHaveBeenCalledTimes(1);
  });
});
