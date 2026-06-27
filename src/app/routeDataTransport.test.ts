import {
  isRealtimeRoutePathname,
  normalizeRoutePathname,
  resolveRouteDataTransportMode,
} from "@/app/routeDataTransport";

describe("route data transport mode", () => {
  it("normalizes route pathnames before classification", () => {
    expect(normalizeRoutePathname("registries/?lang=zh-CN")).toBe("/registries");
    expect(normalizeRoutePathname("/copilot/demo#debug")).toBe("/copilot/demo");
    expect(normalizeRoutePathname("")).toBe("/");
  });

  it("keeps realtime shells on the selected transport mode", () => {
    expect(isRealtimeRoutePathname("/")).toBe(true);
    expect(isRealtimeRoutePathname("/copilot")).toBe(true);
    expect(isRealtimeRoutePathname("/copilot/demo-agent")).toBe(true);
    expect(isRealtimeRoutePathname("/agent/demo-agent")).toBe(true);
    expect(resolveRouteDataTransportMode("/agent/demo-agent", "ws")).toBe("ws");
    expect(resolveRouteDataTransportMode("/copilot", "sse")).toBe("sse");
  });

  it("forces standalone admin and console pages away from websocket transport", () => {
    const standaloneRoutes = [
      "/registries",
      "/automations",
      "/memory",
      "/archives",
      "/archives/chat_1",
      "/agents",
      "/agents/demo-agent",
    ];

    for (const route of standaloneRoutes) {
      expect(isRealtimeRoutePathname(route)).toBe(false);
      expect(resolveRouteDataTransportMode(route, "ws")).toBe("sse");
    }
  });
});
