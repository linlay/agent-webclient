import React, { useEffect, useLayoutEffect } from "react";
import { Spin } from "antd";
import {
  createBrowserRouter,
  useLocation,
  useNavigate,
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
import { isDesktopAppMode } from "@/shared/utils/routing";
import { initializeDesktopQueryContextBridge } from "@/shared/data/desktop/desktopQueryContext";
import {
  I18nProvider,
  readUrlLocale,
  resolveInitialLocale,
  type I18nProviderProps,
  useI18n,
} from "@/shared/i18n";
import { AppearanceProvider, useAppearance } from "@/features/appearance/components/AppearanceProvider";
import { APP_UI_BASE } from "@/shared/utils/routing";
import { useDesktopRouteChange } from "@/shared/hooks/useDesktopRouteChange";
import { BtwProvider } from "@/features/btw/components/BtwProvider";
import { SURFACE_ROUTE_PATHS } from "@/features/surfaces/surfaceRoutes";
import { GatewayAuthBoundary } from "@/features/auth/components/GatewayAuthBoundary";
import { LoginPage } from "./pages/login";
import { useStandaloneDesktopActionRuntime } from "@/features/conversation/hooks/useStandaloneWorkPanelActionRuntime";
import { initializeDesktopContextMenuBridge } from "@/shared/data/desktop/desktopContextMenu";
import { RealtimeTransportProvider } from "@/features/transport/components/RealtimeTransportProvider";
import { WebClientRouteErrorPage, WebClientRenderErrorBoundary } from "@/app/WebClientRenderError";
import "@/app/layout/AppLayoutCompat.module.css";
import "@/app/layout/CopilotLayout.module.css";
import "@/app/layout/ManagementPages.module.css";
import "@/app/layout/SidebarLayout.module.css";

// 管理台与独立 Surface 窗口页面全部按需加载，入口只保留登录页与对话壳层
function lazyPage<T extends React.ComponentType<object>, M>(
  factory: () => Promise<M>,
  pick: (mod: M) => T,
) {
  return React.lazy(() => factory().then((mod) => ({ default: pick(mod) })));
}

const AutomationsPage = lazyPage(() => import("./pages/automations"), (m) => m.AutomationsPage);
const MemoryPage = lazyPage(() => import("./pages/memory"), (m) => m.MemoryPage);
const AgentsPage = lazyPage(() => import("./pages/agents"), (m) => m.AgentsPage);
const ArchivesPage = lazyPage(() => import("./pages/archives"), (m) => m.ArchivesPage);
const RegistriesPage = lazyPage(() => import("./pages/registries"), (m) => m.RegistriesPage);
const ConnectorsPage = lazyPage(() => import("./pages/connectors"), (m) => m.ConnectorsPage);
const SkillsPage = lazyPage(() => import("./pages/skills"), (m) => m.SkillsPage);
const ProjectPage = lazyPage(() => import("./pages/project"), (m) => m.ProjectPage);
const TerminalPage = lazyPage(() => import("./pages/terminal"), (m) => m.TerminalPage);
const HistoryPage = lazyPage(() => import("./pages/history"), (m) => m.HistoryPage);

// Surface 页面按文件粒度动态引入；走 barrel（./pages/surfaces）会把 9 个页面合并成一个 chunk
const BtwViewerPage = lazyPage(() => import("./pages/surfaces/BtwViewerPage"), (m) => m.BtwViewerPage);
const DebugViewerPage = lazyPage(() => import("./pages/surfaces/DebugViewerPage"), (m) => m.DebugViewerPage);
const FileViewerPage = lazyPage(() => import("./pages/surfaces/FileViewerPage"), (m) => m.FileViewerPage);
const OverviewViewerPage = lazyPage(() => import("./pages/surfaces/OverviewViewerPage"), (m) => m.OverviewViewerPage);
const PlanningViewerPage = lazyPage(() => import("./pages/surfaces/PlanningViewerPage"), (m) => m.PlanningViewerPage);
const ResourceViewerPage = lazyPage(() => import("./pages/surfaces/ResourceViewerPage"), (m) => m.ResourceViewerPage);
const SelectionExplainPage = lazyPage(() => import("./pages/surfaces/SelectionExplainPage"), (m) => m.SelectionExplainPage);
const SkillViewerPage = lazyPage(() => import("./pages/surfaces/SkillViewerPage"), (m) => m.SkillViewerPage);
const SourceViewerPage = lazyPage(() => import("./pages/surfaces/SourceViewerPage"), (m) => m.SourceViewerPage);
const WebViewerPage = lazyPage(() => import("./pages/surfaces/WebViewerPage"), (m) => m.WebViewerPage);

const defaultDocumentTitle =
  typeof document === "undefined" ? "" : document.title;

const BaseShell = () => {
  useDesktopRouteChange();
  const location = useLocation();
  const { locale, setLocale } = useI18n();
  const { controller } = useAppearance();
  useLayoutEffect(() => controller.setRouteSearch(location.search), [controller, location.search]);

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
  <BtwProvider enabled={btwEnabled || !isDesktopAppMode()}>{children}</BtwProvider>
);

const AutomationConversationIntentBridge: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const routeState = location.state as
      | { automationConversation?: { chatId?: unknown } }
      | null;
    const chatId = String(routeState?.automationConversation?.chatId || "").trim();
    if (!chatId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent("agent:load-chat", {
          detail: { chatId, focusComposerOnComplete: false },
        }),
      );
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: null,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname, location.search, location.state, navigate]);

  return null;
};

const RootInteractiveRoute: React.FC = () => {
  useStandaloneDesktopActionRuntime();
  return (
    <InteractiveRoute>
      <AppShell />
      <AutomationConversationIntentBridge />
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

  return (
    <React.Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Spin size="large" />
        </div>
      }
    >
      {children}
    </React.Suspense>
  );
};

const AppearanceStateBridge = () => {
  const { resolvedTheme } = useAppearance();
  const { themeMode } = useAppState();
  const { dispatch } = useAppContext();
  useLayoutEffect(() => {
    if (themeMode !== resolvedTheme) dispatch({ type: "SET_THEME_MODE", themeMode: resolvedTheme });
  }, [dispatch, resolvedTheme, themeMode]);
  return null;
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
          path: "/connectors",
          element: (
            <DocumentTitleRoute titleKey="route.title.connectors">
              <ConnectorsPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/connectors/:connectorId",
          element: (
            <DocumentTitleRoute titleKey="route.title.connectors">
              <ConnectorsPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/mcp-servers",
          element: (
            <DocumentTitleRoute titleKey="route.title.connectors">
              <ConnectorsPage />
            </DocumentTitleRoute>
          ),
        },
        {
          path: "/mcp-servers/:serverKey",
          element: (
            <DocumentTitleRoute titleKey="route.title.connectors">
              <ConnectorsPage />
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
          path: SURFACE_ROUTE_PATHS.selectionExplain,
          element: (
            <DocumentTitleRoute titleKey="selection.explain.title">
              <SelectionExplainPage />
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
          path: SURFACE_ROUTE_PATHS.skill,
          element: (
            <DocumentTitleRoute titleKey="route.title.skills">
              <SkillViewerPage />
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
      <AppearanceProvider>
        <WebClientRenderErrorBoundary>
          <AppProvider>
            <AppearanceStateBridge />
            <RealtimeTransportProvider>
              <GatewayAuthBoundary>
                <RouterProvider router={router} />
              </GatewayAuthBoundary>
            </RealtimeTransportProvider>
          </AppProvider>
        </WebClientRenderErrorBoundary>
      </AppearanceProvider>
    </I18nProvider>
  );
};

export default App;
