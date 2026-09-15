import React from "react";
import { APP_UI_BASE } from "@/shared/utils/routing";

let mockDesktopMode = false;

jest.mock("@/shared/utils/routing", () => ({
  ...jest.requireActual("@/shared/utils/routing"),
  isDesktopAppMode: () => mockDesktopMode,
}));

const createBrowserRouterMock = jest.fn(() => ({ kind: "router" }));

jest.mock("react-router-dom", () => ({
  createBrowserRouter: (...args: unknown[]) => createBrowserRouterMock(...args),
  RouterProvider: () => null,
  Navigate: () => null,
}));

jest.mock("antd", () => ({
  ConfigProvider: ({ children }: { children: React.ReactNode }) => children,
  theme: {
    darkAlgorithm: "dark",
    defaultAlgorithm: "light",
  },
}));

jest.mock("@/app/state/AppContext", () => ({
  AppProvider: ({ children }: { children: React.ReactNode }) => children,
  useAppState: () => ({ themeMode: "light" }),
}));

jest.mock("@/app/layout/AppShell", () => ({
  AppShell: () => null,
}));

jest.mock("@/app/layout/CopilotShell", () => ({
  CopilotShell: () => null,
}));

jest.mock("@/app/layout/AgentChatShell", () => ({
  AgentChatShell: () => null,
}));

jest.mock("@/shared/i18n", () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe("App routing", () => {
  beforeEach(() => {
    jest.resetModules();
    createBrowserRouterMock.mockClear();
    mockDesktopMode = false;
  });

  it("mounts the Desktop app routes at the root basename", async () => {
    await import("./App");

    expect(createBrowserRouterMock).toHaveBeenCalledTimes(1);
    expect(createBrowserRouterMock.mock.calls[0][1]).toEqual({
      basename: APP_UI_BASE,
    });
  });

  it("registers the Copilot sidebar route", async () => {
    await import("./App");

    const routes = createBrowserRouterMock.mock.calls[0][0] as Array<{
      path: string;
      children?: Array<{ path: string }>;
    }>;
    const childRoutes = routes.flatMap((route) => route.children || [route]);

    expect(childRoutes.map((route) => route.path)).toEqual(
      expect.arrayContaining([
        "/",
        "/copilot/:agentKey",
        "/automations",
        "/registries",
        "/connectors",
        "/connectors/:connectorId",
        "/mcp-servers",
        "/mcp-servers/:serverKey",
        "/skills",
        "/skills/:skillKey",
        "/overview/:chatId",
        "/debug/:chatId",
        "/btw/:chatId",
        "/source-viewer/:sourceId",
        "/planning-viewer/:planningId",
        "/resource-viewer/:agentKey",
        "/file-viewer/:agentKey",
        "/web-viewer",
        "/history",
        "/terminal/:agentKey",
        "/project/:agentKey",
        "/memory",
        "/agents",
        "/archives",
        "/archives/:chatId",
        "/agents/:agentKey",
        "/agent/:agentKey",
      ]),
    );
    expect(childRoutes.map((route) => route.path)).not.toContain("/summary");
    expect(childRoutes.map((route) => route.path)).not.toEqual(expect.arrayContaining([
      "/copilot",
      "/overview",
      "/debug",
      "/terminal",
      "/project",
      "/agent",
    ]));
  });

  it.each([false, true])("redirects legacy browser explanation links while retaining the Desktop route (%s)", async (desktopMode) => {
    mockDesktopMode = desktopMode;
    await import("./App");
    const routes = createBrowserRouterMock.mock.calls[0][0] as Array<{ children?: Array<{ path: string; element: React.ReactElement }> }>;
    const children = routes.flatMap((route) => route.children || []);
    const explanation = children.find((route) => route.path === "/selection-explain/:chatId")!;
    if (desktopMode) expect(explanation.element.props.titleKey).toBe("selection.explain.title");
    else {
      expect(explanation.element.type).toBe(jest.requireMock("react-router-dom").Navigate);
      expect(explanation.element.props).toMatchObject({ to: "/", replace: true });
    }
    expect(children.map((route) => route.path)).toContain("/btw/:chatId");
  });

  it("registers localized document title keys for agents, archives, automations, and registries", async () => {
    await import("./App");

    const routes = createBrowserRouterMock.mock.calls[0][0] as Array<{
      path: string;
      children?: Array<{ path: string; element?: React.ReactElement }>;
    }>;
    const childRoutes = routes.flatMap((route) => route.children || [route]);

    expect(childRoutes.find((route) => route.path === "/agents")?.element?.props.titleKey).toBe(
      "route.title.agents",
    );
    expect(childRoutes.find((route) => route.path === "/archives")?.element?.props.titleKey).toBe(
      "route.title.archives",
    );
    expect(childRoutes.find((route) => route.path === "/automations")?.element?.props.titleKey).toBe(
      "route.title.automations",
    );
    expect(childRoutes.find((route) => route.path === "/registries")?.element?.props.titleKey).toBe(
      "route.title.registries",
    );
    expect(childRoutes.find((route) => route.path === "/mcp-servers")?.element?.props.titleKey).toBe(
      "route.title.connectors",
    );
    expect(childRoutes.find((route) => route.path === "/skills")?.element?.props.titleKey).toBe(
      "route.title.skills",
    );
    expect(childRoutes.find((route) => route.path === "/project/:agentKey")?.element?.props.titleKey).toBe(
      "route.title.project",
    );
  });
});
