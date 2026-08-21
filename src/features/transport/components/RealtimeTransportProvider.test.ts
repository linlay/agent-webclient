import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RealtimeTransportProvider } from "@/features/transport/components/RealtimeTransportProvider";
import type { RealtimeTransport } from "@/features/transport/contracts/realtimeTransport";
import type {
  AgentWebclientWorkPanelBridge,
  DesktopPlatformFramePort,
  DesktopPlatformSession,
} from "@/features/transport/contracts/generated/agentWebclientBridge";

const runtimeConfig = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("RealtimeTransportProvider", () => {
  afterEach(() => {
    delete runtimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
    Reflect.deleteProperty(globalThis, "window");
  });

  function installDesktopBridges(): void {
    const session: DesktopPlatformSession = {
      send: jest.fn(),
      close: jest.fn(),
      onFrame: jest.fn(() => () => undefined),
      onState: jest.fn(() => () => undefined),
      onClose: jest.fn(() => () => undefined),
    };
    const platformFramePort: DesktopPlatformFramePort = {
      transportVersion: 2,
      createSession: jest.fn(() => session),
    };
    const workPanel: AgentWebclientWorkPanelBridge = {
      getCapabilities: jest.fn(async () => ({ ok: true, capabilities: ["workpanel.open"] })),
      openItem: jest.fn(),
      activateItem: jest.fn(),
      closeItem: jest.fn(),
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { search: "" },
        __AGENT_WEBCLIENT_PLATFORM_FRAME_PORT__: platformFramePort,
        __AGENT_WEBCLIENT_WORKPANEL_BRIDGE__: workPanel,
      },
    });
  }

  it("creates Standalone lazily and renders its children", () => {
    const standaloneFactory = jest.fn(
      () => ({ kind: "standalone" }) as RealtimeTransport,
    );

    const html = renderToStaticMarkup(
      React.createElement(
        RealtimeTransportProvider,
        { standaloneFactory },
        React.createElement("span", null, "ready"),
      ),
    );

    expect(html).toContain("ready");
    expect(standaloneFactory).toHaveBeenCalledTimes(1);
  });

  it("blocks Desktop when the canonical trusted bridge is unavailable", () => {
    runtimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { DESKTOP_APP: true };
    const standaloneFactory = jest.fn(
      () => ({ kind: "standalone" }) as RealtimeTransport,
    );

    const html = renderToStaticMarkup(
      React.createElement(
        RealtimeTransportProvider,
        { standaloneFactory },
        React.createElement("span", null, "must-not-render"),
      ),
    );

    expect(html).toContain("DESKTOP_BRIDGE_UNAVAILABLE");
    expect(html).not.toContain("must-not-render");
    expect(standaloneFactory).not.toHaveBeenCalled();
  });

  it("blocks an incompatible Desktop Frame Port version", () => {
    runtimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { DESKTOP_APP: true };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { search: "" },
        __AGENT_WEBCLIENT_PLATFORM_FRAME_PORT__: {
          transportVersion: 1,
          createSession: jest.fn(),
        },
        __AGENT_WEBCLIENT_WORKPANEL_BRIDGE__: {
          getCapabilities: jest.fn(), openItem: jest.fn(), activateItem: jest.fn(), closeItem: jest.fn(),
        },
      },
    });

    const html = renderToStaticMarkup(
      React.createElement(
        RealtimeTransportProvider,
        null,
        React.createElement("span", null, "must-not-render"),
      ),
    );

    expect(html).toContain("DESKTOP_BRIDGE_INCOMPATIBLE");
    expect(html).not.toContain("must-not-render");
  });

  it("renders Desktop children when both canonical bridges exist without creating Standalone", () => {
    runtimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { DESKTOP_APP: true };
    installDesktopBridges();
    const standaloneFactory = jest.fn(
      () => ({ kind: "standalone" }) as RealtimeTransport,
    );

    const html = renderToStaticMarkup(
      React.createElement(
        RealtimeTransportProvider,
        { standaloneFactory },
        React.createElement("span", null, "desktop-ready"),
      ),
    );

    expect(html).toContain("desktop-ready");
    expect(html).not.toContain("DESKTOP_BRIDGE_UNAVAILABLE");
    expect(standaloneFactory).not.toHaveBeenCalled();
  });
});
