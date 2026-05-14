import React from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppProvider, useAppState } from "@/app/state/AppContext";
import { AppShell } from "@/app/layout/AppShell";
import { CopilotShell } from "@/app/layout/CopilotShell";
import { I18nProvider, type I18nProviderProps } from "@/shared/i18n";
import { APP_UI_BASE } from "@/shared/utils/routing";
import { SchedulesPage } from "./pages/schedules";
import { MemoryPage } from "./pages/memory";
import { AgentsPage } from "./pages/agents";

const ThemedShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { themeMode } = useAppState();
  const isDark = themeMode === "dark";

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark
          ? antdTheme.darkAlgorithm
          : antdTheme.defaultAlgorithm,
        token: isDark
          ? {
              colorPrimary: "#4f88ff",
              colorSuccess: "#27c346",
              colorWarning: "#ff9a2e",
              colorError: "#f76560",
              colorInfo: "#a55eea",
              colorBgBase: "#0d0e10",
              colorBgLayout: "#0d0e10",
              colorBgContainer: "#161719",
              colorBgElevated: "#161719",
              colorText: "#f2f3f5",
              colorTextSecondary: "#c9cdd4",
              colorTextTertiary: "#86909c",
              colorBorder: "rgba(255, 255, 255, 0.08)",
              colorBorderSecondary: "rgba(255, 255, 255, 0.14)",
              borderRadius: 8,
              controlHeight: 32,
              fontFamily:
                '"Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif',
            }
          : {
              colorPrimary: "#2663eb",
              colorSuccess: "#00b42a",
              colorWarning: "#ff7d00",
              colorError: "#f53f3f",
              colorInfo: "#722ed1",
              colorBgBase: "#f2f3f5",
              colorBgLayout: "#f2f3f5",
              colorBgContainer: "#ffffff",
              colorBgElevated: "#ffffff",
              colorText: "#1d2129",
              colorTextSecondary: "#4e5969",
              colorTextTertiary: "#86909c",
              colorBorder: "#e5e6eb",
              colorBorderSecondary: "#c9cdd4",
              borderRadius: 8,
              controlHeight: 32,
              fontFamily:
                '"Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif',
            },
      }}
    >
      {children}
    </ConfigProvider>
  );
};

const ThemedAppShell: React.FC = () => (
  <ThemedShell>
    <AppShell />
  </ThemedShell>
);

const ThemedCopilotShell: React.FC = () => (
  <ThemedShell>
    <CopilotShell />
  </ThemedShell>
);

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <ThemedAppShell />,
    },
    {
      path: "/copilot",
      element: <ThemedCopilotShell />,
    },
    {
      path: "/schedules",
      element: <SchedulesPage />,
    },
    {
      path: "/memory",
      element: <MemoryPage />,
    },
    {
      path: "/agents",
      element: <AgentsPage />,
    },
  ],
  {
    basename: APP_UI_BASE,
  },
);

interface AppProps {
  i18n?: Omit<I18nProviderProps, "children">;
}

const App: React.FC<AppProps> = ({ i18n }) => {
  const mergedI18n: Omit<I18nProviderProps, "children"> = {
    locale: "zh-CN",
    fallbackLocale: "zh-CN",
    persistLocale: false,
    ...(i18n || {}),
  };

  return (
    <I18nProvider {...mergedI18n}>
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>
    </I18nProvider>
  );
};

export default App;
