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

jest.mock("@/shared/i18n", () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("./pages/schedules", () => ({
  SchedulesPage: () => null,
}));

jest.mock("./pages/memory", () => ({
  MemoryPage: () => null,
}));

describe("App routing", () => {
  beforeEach(() => {
    jest.resetModules();
    createBrowserRouterMock.mockClear();
  });

  it("mounts the Desktop app routes below the appagent basename", async () => {
    await import("./App");

    expect(createBrowserRouterMock).toHaveBeenCalledTimes(1);
    expect(createBrowserRouterMock.mock.calls[0][1]).toEqual({
      basename: APP_UI_BASE,
    });
  });
});
