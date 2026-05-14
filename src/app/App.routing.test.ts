import React from "react";
import { APP_UI_BASE } from "@/shared/utils/routing";

const createBrowserRouterMock = jest.fn(() => ({ kind: "router" }));

jest.mock("react-router-dom", () => ({
  createBrowserRouter: (...args: unknown[]) => createBrowserRouterMock(...args),
  RouterProvider: () => null,
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

jest.mock("@/shared/i18n", () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("./pages/schedules", () => ({
  SchedulesPage: () => null,
}));

jest.mock("./pages/memory", () => ({
  MemoryPage: () => null,
}));

jest.mock("./pages/agents", () => ({
  AgentsPage: () => null,
}));

describe("App routing", () => {
  beforeEach(() => {
    jest.resetModules();
    createBrowserRouterMock.mockClear();
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
    }>;

    expect(routes.map((route) => route.path)).toEqual(
      expect.arrayContaining(["/", "/copilot", "/schedules", "/memory", "/agents"]),
    );
  });
});
