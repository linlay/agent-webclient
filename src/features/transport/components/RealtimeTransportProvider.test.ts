import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RealtimeTransportProvider } from "@/features/transport/components/RealtimeTransportProvider";
import type { RealtimeTransport } from "@/features/transport/contracts/realtimeTransport";

const runtimeConfig = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("RealtimeTransportProvider", () => {
  afterEach(() => {
    delete runtimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
  });

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
});
