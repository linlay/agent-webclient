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
  useAppContext,
  useAppState,
} from "@/app/state/AppContext";
import { AppShell } from "@/app/layout/AppShell";
import { CopilotShell } from "@/app/layout/CopilotShell";
import { AgentChatShell } from "@/app/layout/AgentChatShell";
import { initializeDesktopQueryContextBridge } from "@/shared/data/desktop/desktopQueryContext";
import {
  I18nProvider,
  readUrlLocale,
  resolveInitialLocale,
  type I18nProviderProps,
  useI18n,
} from "@/shared/i18n";
import {
  readThemeModeFromUrl,
  resolveInitialThemeMode,
  syncThemeMode,
} from "@/shared/styles/theme";
import { APP_UI_BASE } from "@/shared/utils/routing";
import { AutomationsPage } from "./pages/automations";
import { MemoryPage } from "./pages/memory";
import { AgentsPage } from "./pages/agents";
import { ArchivesPage } from "./pages/archives";
import { RegistriesPage } from "./pages/registries";
import { McpServersPage } from "./pages/mcp-servers";
import { SkillsPage } from "./pages/skills";
import { ProjectPage } from "./pages/project";
import { useDesktopRouteChange } from "@/shared/hooks/useDesktopRouteChange";
import { BtwProvider } from "@/features/btw/components/BtwProvider";
import { SURFACE_ROUTE_PATHS } from "@/features/surfaces/surfaceRoutes";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import { GatewayAuthBoundary } from "@/shared/data/auth/GatewayAuthBoundary";
import { LoginPage } from "./pages/login";
import { TerminalPage } from "./pages/terminal";
import {
  BtwViewerPage,
  DebugViewerPage,
  FileViewerPage,
  OverviewViewerPage,
  PlanningViewerPage,
  ResourceViewerPage,
  SourceViewerPage,
  WebViewerPage,
} from "./pages/surfaces";
import { HistoryPage } from "./pages/history";
import { useWebClientActionRuntime } from "@/features/conversation/hooks/useWebClientActionRuntime";
import { initializeDesktopContextMenuBridge } from "@/shared/data/desktop/desktopContextMenu";
import { RealtimeTransportProvider } from "@/features/transport/components/RealtimeTransportProvider";
import { WebClientRouteErrorPage } from "@/app/WebClientRenderError";

const defaultDocumentTitle =
  typeof document === "undefined" ? "" : document.title;

const BaseShell = () => {
  useDesktopRouteChange();
  const location = useLocation();
  const { dispatch, stateRef } = useAppContext();
  const { locale, setLocale } = useI18n();
  const hadUrlThemeOverrideRef = useRef(false);

  useEffect(() => {
    const urlThemeMode = readThemeModeFromUrl(location.search);
    if (urlThemeMode) {
      hadUrlThemeOverrideRef.current = true;
      if (stateRef.current.themeMode === urlThemeMode) {
        syncThemeMode(urlThemeMode);
      } else {
        dispatch({ type: "SET_THEME_MODE", themeMode: urlThemeMode });
      }
      return;
    }

    if (!hadUrlThemeOverrideRef.current) {
      return;
    }

    hadUrlThemeOverrideRef.current = false;
    const themeMode = resolveInitialThemeMode(location.search);
    if (stateRef.current.themeMode === themeMode) {
      syncThemeMode(themeMode);
    } else {
      dispatch({ type: "SET_THEME_MODE", themeMode });
    }
  }, [dispatch, location.search, stateRef]);

  useEffect(() => {
    const routeLocale = readUrlLocale(location.search);
    const nextLocale = routeLocale || resolveInitialLocale();
    if (nextLocale !== locale) {
      setLocale(nextLocale, { persist: false });
    }
  }, [locale, location.search, setLocale]);

  return <Outlet />;
};

const InteractiveRoute: React.FC<{
  children: React.ReactNode;
  btwEnabled?: boolean;
}> = ({ children, btwEnabled = true }) => (
  <BtwProvider enabled={btwEnabled}>{children}</BtwProvider>
);

const RootInteractiveRoute: React.FC = () => {
  useWebClientActionRuntime();
  return (
    <InteractiveRoute>
      <AppShell />
    </InteractiveRoute>
  );
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
              colorBgElevated: "#202020",
              colorText: "#f2f3f5",
              colorTextSecondary: "#c9cdd4",
              colorTextTertiary: "#86909c",
              colorBorder: "rgba(255, 255, 255, 0.08)",
              colorBorderSecondary: "rgba(255, 255, 255, 0.14)",
              borderRadius: 8,
              controlHeight: 32,
              fontFamily: "var(--font-sans)",
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
              fontFamily: "var(--font-sans)",
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
      errorElement: <WebClientRouteErrorPage />,
      children: [
        {
          path: "/login",
          element: (
            <DocumentTitleRoute titleKey="route.title.login">
              <LoginPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/",
          element: (
            <DocumentTitleRoute>
              <RootInteractiveRoute />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/copilot/:agentKey",
          element: (
            <DocumentTitleRoute>
              <InteractiveRoute btwEnabled={false}>
                <CopilotShell />
              </InteractiveRoute>
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
          path: "/mcp-servers",
          element: (
            <DocumentTitleRoute titleKey="route.title.mcpServers">
              <McpServersPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/mcp-servers/:serverKey",
          element: (
            <DocumentTitleRoute titleKey="route.title.mcpServers">
              <McpServersPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/skills",
          element: (
            <DocumentTitleRoute titleKey="route.title.skills">
              <SkillsPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/skills/:skillKey",
          element: (
            <DocumentTitleRoute titleKey="route.title.skills">
              <SkillsPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: SURFACE_ROUTE_PATHS.overview,
          element: (
            <DocumentTitleRoute titleKey="copilot.panel.overview">
              <OverviewViewerPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: SURFACE_ROUTE_PATHS.debug,
          element: (
            <DocumentTitleRoute titleKey="copilot.panel.debug">
              <DebugViewerPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: SURFACE_ROUTE_PATHS.btw,
          element: (
            <DocumentTitleRoute titleKey="btw.title">
              <BtwViewerPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: SURFACE_ROUTE_PATHS.source,
          element: (
            <DocumentTitleRoute titleKey="copilot.panel.sourceDetail">
              <SourceViewerPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: SURFACE_ROUTE_PATHS.planning,
          element: (
            <DocumentTitleRoute titleKey="rightSidebar.overview.planning.title">
              <PlanningViewerPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: SURFACE_ROUTE_PATHS.resource,
          element: (
            <DocumentTitleRoute titleKey="attachments.kind.file">
              <ResourceViewerPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: SURFACE_ROUTE_PATHS.file,
          element: (
            <DocumentTitleRoute titleKey="attachments.kind.file">
              <FileViewerPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: SURFACE_ROUTE_PATHS.web,
          element: (
            <DocumentTitleRoute titleKey="copilot.panel.web">
              <WebViewerPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: SURFACE_ROUTE_PATHS.history,
          element: (
            <DocumentTitleRoute titleKey="leftSidebar.historyTitle">
              <HistoryPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: SURFACE_ROUTE_PATHS.terminal,
          element: (
            <DocumentTitleRoute titleKey="terminal.panelAria">
              <TerminalPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: SURFACE_ROUTE_PATHS.project,
          element: (
            <DocumentTitleRoute titleKey="route.title.project">
              <ProjectPage />
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
          path: SURFACE_ROUTE_PATHS.agent,
          element: (
            <DocumentTitleRoute titleKey="route.title.agent">
              <InteractiveRoute>
                <AgentChatShell />
              </InteractiveRoute>
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

  useEffect(() => initializeDesktopContextMenuBridge(), []);

  return (
    <I18nProvider {...mergedI18n}>
      <AppProvider>
        <RealtimeTransportProvider>
          <ThemedShell>
            <GatewayAuthBoundary>
              <RouterProvider router={router} />
            </GatewayAuthBoundary>
          </ThemedShell>
        </RealtimeTransportProvider>
      </AppProvider>
    </I18nProvider>
  );
};

export default App;
