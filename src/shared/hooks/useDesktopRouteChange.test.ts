import {
  buildDesktopRouteTarget,
  resetDesktopRouteChangeBridgeForTests,
  subscribeDesktopRouteChanges,
  type DesktopRouteChangedPayload,
} from "./useDesktopRouteChange";

type RouteCallback = (
  event: unknown,
  payload: DesktopRouteChangedPayload,
) => void;

function installMockWindow(onFromMain: jest.Mock): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      electronAPI: {
        onFromMain,
      },
      location: {
        pathname: "/agent/current",
        search: "",
        hash: "",
      },
    },
  });
}

describe("useDesktopRouteChange bridge", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    resetDesktopRouteChangeBridgeForTests();
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        writable: true,
        value: originalWindow,
      });
    }
  });

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
      "zenmind:service-webview:route",
      expect.any(Function),
    );

    callbacks[0]?.({}, {
      type: "desktopRouteChanged",
      pathname: "/agent/model-mimo",
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
      pathname: "/copilot/zenmi",
      search: "chatId=chat_1",
    });

    expect(onFromMain).toHaveBeenCalledTimes(1);
    expect(firstTargets).toEqual([]);
    expect(secondTargets).toEqual(["/copilot/zenmi?chatId=chat_1"]);
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
      pathname: "/agent/zenmi",
    });
    callbacks[0]?.({}, {
      type: "desktopRouteChanged",
      pathname: "",
    });

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
