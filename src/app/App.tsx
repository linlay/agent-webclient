import React, { useEffect, useRef } from "react";
import { ConfigProvider, theme as antdTheme, App as AntdApp } from "antd";
import {
  createBrowserRouter,
  useLocation,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import {
  AppProvider,
  useAppDispatch,
  useAppState,
} from "@/app/state/AppContext";
import { AppShell } from "@/app/layout/AppShell";
import { CopilotShell } from "@/app/layout/CopilotShell";
import { AgentChatShell } from "@/app/layout/AgentChatShell";
import { initializeDesktopQueryContextBridge } from "@/shared/api/desktopQueryContext";
import {
  I18nProvider,
  readUrlLocale,
  resolveInitialLocale,
  type I18nProviderProps,
  useI18n,
} from "@/shared/i18n";
import {
  readHostThemeMode,
  readStoredThemeMode,
  readUrlThemeMode,
} from "@/shared/styles/theme";
import { APP_UI_BASE } from "@/shared/utils/routing";
import { AutomationsPage } from "./pages/automations";
import { MemoryPage } from "./pages/memory";
import { AgentsPage } from "./pages/agents";
import { ArchivesPage } from "./pages/archives";
import { RegistriesPage } from "./pages/registries";
import { useDesktopRouteChange } from "@/shared/hooks/useDesktopRouteChange";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";

const defaultDocumentTitle =
  typeof document === "undefined" ? "" : document.title;

const BaseShell = () => {
  useDesktopRouteChange();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { locale, setLocale } = useI18n();
  const hadRouteThemeOverrideRef = useRef(false);

  useEffect(() => {
    const routeThemeMode = readUrlThemeMode(location.search);
    if (routeThemeMode) {
      hadRouteThemeOverrideRef.current = true;
      dispatch({ type: "SET_THEME_MODE", themeMode: routeThemeMode });
      return;
    }

    if (!hadRouteThemeOverrideRef.current) {
      return;
    }

    hadRouteThemeOverrideRef.current = false;
    const nextThemeMode =
      readHostThemeMode() || readStoredThemeMode() || "light";
    dispatch({ type: "SET_THEME_MODE", themeMode: nextThemeMode });
  }, [dispatch, location.search]);

  useEffect(() => {
    const routeLocale = readUrlLocale(location.search);
    const nextLocale = routeLocale || resolveInitialLocale();
    if (nextLocale !== locale) {
      setLocale(nextLocale, { persist: false });
    }
  }, [locale, location.search, setLocale]);

  return <Outlet />;
};
const DocumentTitleRoute: React.FC<{
  title?: string;
  titleKey?: string;
  children: React.ReactNode;
}> = ({ title, titleKey, children }) => {
  const { t } = useI18n();
  useEffect(() => {
    document.title = titleKey ? t(titleKey) : title || defaultDocumentTitle;
  }, [t, title, titleKey]);

  return <>{children}</>;
};

const ThemedShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { themeMode } = useAppState();
  const { locale } = useI18n();
  const isDark = themeMode === "dark";

  return (
    <ConfigProvider
      locale={locale === "en-US" ? enUS : zhCN}
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
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
};

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <BaseShell />,
      children: [
        {
          path: "/",
          element: (
            <DocumentTitleRoute>
              <AppShell />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/copilot",
          element: (
            <DocumentTitleRoute>
              <CopilotShell />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/copilot/:agentKey",
          element: (
            <DocumentTitleRoute>
              <CopilotShell />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/automations",
          element: (
            <DocumentTitleRoute titleKey="route.title.automations">
              <AutomationsPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/registries",
          element: (
            <DocumentTitleRoute titleKey="route.title.registries">
              <RegistriesPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/memory",
          element: (
            <DocumentTitleRoute titleKey="route.title.memory">
              <MemoryPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/agents",
          element: (
            <DocumentTitleRoute titleKey="route.title.agents">
              <AgentsPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/archives",
          element: (
            <DocumentTitleRoute titleKey="route.title.archives">
              <ArchivesPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/archives/:chatId",
          element: (
            <DocumentTitleRoute titleKey="route.title.archives">
              <ArchivesPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/agents/:agentKey",
          element: (
            <DocumentTitleRoute titleKey="route.title.agents">
              <AgentsPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/agent/:agentKey",
          element: (
            <DocumentTitleRoute titleKey="route.title.agent">
              <AgentChatShell />
            </DocumentTitleRoute>
          ),
        },
      ],
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
    fallbackLocale: "zh-CN",
    ...(i18n || {}),
  };

  useEffect(() => {
    initializeDesktopQueryContextBridge();
  }, []);

  return (
    <I18nProvider {...mergedI18n}>
      <AppProvider>
        <ThemedShell>
          <RouterProvider router={router} />
        </ThemedShell>
      </AppProvider>
    </I18nProvider>
  );
};

export default App;
