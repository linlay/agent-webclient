import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RealtimeTransportProvider } from "@/features/transport/components/RealtimeTransportProvider";
import type { RealtimeTransport } from "@/features/transport/contracts/realtimeTransport";
import type {
  AgentWebclientRealtimeBridge,
  AgentWebclientWorkPanelBridge,
} from "@/features/transport/contracts/generated/agentWebclientBridge";
import { AGENT_WEBCLIENT_BRIDGE_VERSION } from "@/features/transport/contracts/generated/agentWebclientBridge";

const runtimeConfig = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("RealtimeTransportProvider", () => {
  afterEach(() => {
    delete runtimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
    Reflect.deleteProperty(globalThis, "window");
  });

  function installDesktopBridges(): void {
    const realtime: AgentWebclientRealtimeBridge = {
      hello: jest.fn(async () => ({
        version: AGENT_WEBCLIENT_BRIDGE_VERSION,
        surface: {
          kind: "agent-chat",
          capabilities: ["run.attach", "push.subscribe", "workpanel.open"],
          route: "/agent/agent-1?chatId=chat-1",
          ownerChatId: "chat-1",
        },
        connection: { phase: "connected", generation: 1 },
      })),
      request: jest.fn(),
      subscribe: jest.fn(),
      detach: jest.fn(),
      onMessage: jest.fn(() => () => undefined),
    };
    const workPanel: AgentWebclientWorkPanelBridge = {
      openItem: jest.fn(),
      activateItem: jest.fn(),
      closeItem: jest.fn(),
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        __AGENT_WEBCLIENT_REALTIME_BRIDGE__: realtime,
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

  it("blocks a legacy v1 Desktop bridge as incompatible", () => {
    runtimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { DESKTOP_APP: true };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { search: "" },
        __AGENT_WEBCLIENT_REALTIME_BRIDGE__: {
          hello: jest.fn(),
          request: jest.fn(),
          subscribe: jest.fn(),
          unsubscribe: jest.fn(),
          onMessage: jest.fn(),
        },
        __AGENT_WEBCLIENT_WORKPANEL_BRIDGE__: {
          openItem: jest.fn(), activateItem: jest.fn(), closeItem: jest.fn(),
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
