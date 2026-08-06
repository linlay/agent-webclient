import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { Drawer, Tabs, type TabsProps } from "antd";
import {
  resolveStatusPillClassName,
  resolveTopNavStatus,
} from "@/app/layout/TopNav";
import { useAppRuntimes } from "@/app/layout/hooks/useAppRuntimes";
import { GlobalShortcutLayer } from "@/features/workers/hooks/useGlobalShortcuts";
import { AttachmentPreviewPanel } from "@/features/artifacts/components/AttachmentPreviewPanel";
import { DebugTab } from "@/app/layout/sidebar/right/DebugTab";
import { OverviewTab } from "@/app/layout/sidebar/right/OverviewTab";
import { SourceDetailTab } from "@/app/layout/sidebar/right/SourceDetailTab";
import { PlanningPreviewTab } from "@/app/layout/sidebar/right/PlanningPreviewTab";
import { BtwTab } from "@/features/btw/components/BtwTab";
import { useBTW } from "@/features/btw/components/BtwProvider";
import { BottomDock } from "@/app/layout/BottomDock";
import { ShellOverlays } from "@/app/layout/ShellOverlays";
import {
  SettingsOverlayProvider,
  useSettingsOverlayActions,
} from "@/features/settings/components/SettingsOverlayProvider";
import {
  CommandOverlayProvider,
  useCommandOverlayActions,
} from "@/features/workers/components/CommandOverlayProvider";
import { ConversationStage } from "@/features/timeline/components/ConversationStage";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { isDebugPanelEnabled, isSettingsMenuEnabled } from "@/shared/config/featureFlags";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { WebPreviewPanel } from "@/features/web-preview/components/WebPreviewPanel";

const COPILOT_SHELL_CLASS =
  "app-shell layout-copilot tw:grid tw:h-[100dvh] tw:min-h-0 tw:grid-cols-[minmax(0,1fr)] tw:grid-rows-[auto_minmax(0,1fr)_auto] tw:gap-0 tw:overflow-hidden tw:bg-bg-base tw:p-0 tw:[&_.conversation-stage]:row-start-2 tw:[&_.conversation-stage]:min-w-0";
const COPILOT_TOPBAR_CLASS =
  "copilot-topbar tw:relative tw:z-30 tw:row-start-1 tw:flex tw:min-w-0 tw:items-stretch tw:border-b tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-card)_96%,var(--bg-base))] tw:px-2 tw:py-2 tw:shadow-elevated tw:[html[data-theme=dark]_&]:bg-[color-mix(in_srgb,var(--bg-base)_94%,transparent)]";
const COPILOT_TOPBAR_ROW_CLASS =
  "copilot-topbar-row tw:flex tw:w-full tw:min-w-0 tw:items-center tw:justify-between tw:gap-1.5";
const COPILOT_TITLE_BLOCK_CLASS =
  "copilot-title-block tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-1";
const COPILOT_WORKER_NAME_CLASS =
  "copilot-worker-name tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[13px] tw:leading-[1.25] tw:text-ink-1";
const COPILOT_ACTION_BTN_CLASS =
  "copilot-action-btn ui-icon-hover-24 tw:h-[30px] tw:min-h-[30px] tw:w-[30px] tw:min-w-[30px] tw:rounded-lg tw:bg-[color-mix(in_srgb,var(--bg-elev-2)_82%,transparent)] tw:p-0 tw:text-ink-2 tw:[&_.material-icon]:text-[17px]";
const COPILOT_WORKER_SWITCH_BTN_CLASS = [
  COPILOT_ACTION_BTN_CLASS,
  "copilot-worker-switch-btn tw:flex-none",
].join(" ");
const COPILOT_TOPBAR_ACTIONS_CLASS =
  "copilot-topbar-actions tw:flex tw:min-w-0 tw:flex-none tw:items-center tw:gap-1";
const COPILOT_SIDE_PANEL_CLASS =
  "copilot-side-panel tw:fixed tw:inset-y-0 tw:left-0 tw:z-[45] tw:flex tw:w-[min(100vw,360px)] tw:max-w-[360px] tw:flex-col tw:border-r tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-bg-elev-2 tw:shadow-overlay tw:[html[data-theme=dark]_&]:bg-bg-base";
const COPILOT_SIDE_PANEL_HEAD_CLASS =
  "copilot-side-panel-head tw:flex-none tw:flex tw:items-center tw:justify-between tw:gap-2.5 tw:border-b tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:px-3 tw:py-2.5 tw:[&>strong]:text-sm";
const COPILOT_SIDE_PANEL_BODY_CLASS =
  "copilot-side-panel-body tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-auto tw:[&_.attachment-preview-panel]:h-full tw:[&_.debug-tab]:h-full tw:[&_.right-sidebar-overview]:h-full tw:[&_.web-preview-panel]:h-full";

function buildCopilotWebTabKey(url: string): string {
  return `web:${url}`;
}

function getCopilotWebTabUrl(key: string): string {
  return key.startsWith("web:") ? key.slice("web:".length) : "";
}

const CopilotWebPreviewTabs: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const activePreview =
    state.webPreviews.find(
      (preview) => preview.url === state.activeWebPreviewUrl,
    ) || state.webPreviews[state.webPreviews.length - 1];
  const items = useMemo<NonNullable<TabsProps["items"]>>(
    () =>
      state.webPreviews.map((preview) => ({
        key: buildCopilotWebTabKey(preview.url),
        label: (
          <span className="tw:inline-flex tw:max-w-[112px] tw:items-center tw:gap-1">
            <MaterialIcon name="open_in_new" />
            <span className="tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">
              {preview.title}
            </span>
          </span>
        ),
        children: <WebPreviewPanel preview={preview} />,
      })),
    [state.webPreviews],
  );

  if (!activePreview) {
    return <OverviewTab />;
  }

  return (
    <Tabs
      className="right-sidebar-tabs copilot-web-preview-tabs"
      size="small"
      type="editable-card"
      hideAdd
      activeKey={buildCopilotWebTabKey(activePreview.url)}
      items={items}
      onChange={(key) => {
        const targetUrl = getCopilotWebTabUrl(key);
        const isSame =
          state.rightSidebarOpen &&
          state.rightSidebarOpenTab === "web" &&
          state.activeWebPreviewUrl === targetUrl;
        if (isSame) {
          dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
        } else {
          dispatch({
            type: "OPEN_RIGHT_SIDEBAR",
            tab: "web",
            activeWebPreviewUrl: targetUrl,
          });
        }
      }}
      onEdit={(key, action) => {
        if (action !== "remove" || typeof key !== "string") {
          return;
        }
        const urlToRemove = getCopilotWebTabUrl(key);
        const remaining = state.webPreviews.filter(
          (preview) => preview.url !== urlToRemove,
        );
        dispatch({
          type: "OPEN_RIGHT_SIDEBAR",
          tab: remaining.length > 0 ? "web" : "overview",
          removeWebPreviewUrl: urlToRemove,
        });
      }}
    />
  );
};

function normalizeRouteValue(value: string | null | undefined) {
  return String(value || "").trim();
}

const COPILOT_ROUTE_ONE_SHOT_PARAMS = [
  "agentKey",
  "newChat",
  "newChatRequest",
  "history",
  "historyRequest",
] as const;

export function createCopilotChatRoute(
  agentKey: string,
  searchParams: URLSearchParams,
  chatId = "",
): string {
  const normalizedAgentKey = normalizeRouteValue(agentKey);
  if (!normalizedAgentKey) {
    return "";
  }

  const nextSearchParams = new URLSearchParams(searchParams);
  for (const key of COPILOT_ROUTE_ONE_SHOT_PARAMS) {
    nextSearchParams.delete(key);
  }
  const normalizedChatId = normalizeRouteValue(chatId);
  if (normalizedChatId) {
    nextSearchParams.set("chatId", normalizedChatId);
  } else {
    nextSearchParams.delete("chatId");
  }
  const nextSearch = nextSearchParams.toString();
  return `/copilot/${encodeURIComponent(normalizedAgentKey)}${
    nextSearch ? `?${nextSearch}` : ""
  }`;
}

function createCopilotRouteTargetKey(agentKey: string, chatId: string): string {
  return `${normalizeRouteValue(agentKey)}\u0000${normalizeRouteValue(chatId)}`;
}

type CopilotConversationRouteEventDetail = {
  agentKey?: unknown;
  chatId?: unknown;
};

const CopilotTopBar: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const { openOverlay } = useSettingsOverlayActions();
  const { openCommandOverlay } = useCommandOverlayActions();
  const currentWorker = resolveCurrentWorkerSummary(state);
  const { statusClass, statusText, statusDetail } = resolveTopNavStatus(state);
  const debugPanelEnabled = isDebugPanelEnabled();
  const settingsMenuEnabled = isSettingsMenuEnabled();
  const [debugDrawerOpen, setDebugDrawerOpen] = useState(false);
  const statusLabel = t(statusText);
  const statusTitle = statusDetail
    ? `${statusLabel}: ${statusDetail}`
    : statusLabel;

  const handleStartNewConversation = () => {
    window.dispatchEvent(
      new CustomEvent("agent:start-new-conversation", {
        detail: {
          ...(currentWorker?.type === "agent" && currentWorker.sourceId
            ? { agentKey: currentWorker.sourceId }
            : {}),
          preserveWorkerContext: true,
          focusComposerOnComplete: false,
        },
      }),
    );
  };

  return (
    <header className={COPILOT_TOPBAR_CLASS}>
      <div className={COPILOT_TOPBAR_ROW_CLASS}>
        <div className={COPILOT_TITLE_BLOCK_CLASS}>
          <strong className={COPILOT_WORKER_NAME_CLASS}>
            {currentWorker?.displayName || t("topNav.noSelection")}
          </strong>
          <UiButton
            className={COPILOT_WORKER_SWITCH_BTN_CLASS}
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t("commandModal.switch.title")}
            title={t("commandModal.switch.title")}
            onClick={() => openCommandOverlay({ type: "switch" })}
          >
            <MaterialIcon name="swap_horiz" />
          </UiButton>
          <span
            className={resolveStatusPillClassName(statusClass, "compact")}
            id="copilot-api-status"
            title={statusTitle}
            aria-label={statusTitle}
          >
            {statusLabel}
          </span>
        </div>
        <div className={COPILOT_TOPBAR_ACTIONS_CLASS}>
          <UiButton
            className={`${COPILOT_ACTION_BTN_CLASS} ui-icon-hover-20`}
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t("topNav.newConversation")}
            title={t("topNav.newConversation")}
            onClick={handleStartNewConversation}
          >
            <MaterialIcon name="edit_square" />
          </UiButton>
          <UiButton
            className={COPILOT_ACTION_BTN_CLASS}
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t("commandModal.history.title")}
            title={t("commandModal.history.title")}
            onClick={() => openCommandOverlay({ type: "history" })}
          >
            <MaterialIcon name="history" />
          </UiButton>
          {debugPanelEnabled ? (
            <UiButton
              className={COPILOT_ACTION_BTN_CLASS}
              variant="ghost"
              size="sm"
              iconOnly
              active={
                debugDrawerOpen ||
                (state.rightSidebarOpen &&
                  state.rightSidebarOpenTab === "debug")
              }
              aria-label={
                debugDrawerOpen
                  ? t("topNav.debug.close")
                  : t("topNav.debug.open")
              }
              title={
                debugDrawerOpen
                  ? t("topNav.debug.close")
                  : t("topNav.debug.open")
              }
              onClick={() => setDebugDrawerOpen((open) => !open)}
            >
              <MaterialIcon name="bug_report" />
            </UiButton>
          ) : null}
          {settingsMenuEnabled ? (
          <UiButton
            className={COPILOT_ACTION_BTN_CLASS}
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t("settings.title")}
            title={t("settings.title")}
            onClick={() => openOverlay("settings")}
          >
            <MaterialIcon name="settings" />
          </UiButton>
          ) : null}
        </div>
      </div>
      <Drawer
        open={debugPanelEnabled && debugDrawerOpen}
        onClose={() => setDebugDrawerOpen(false)}
        title={t("copilot.panel.debug")}
        closable={{ closeIcon: <MaterialIcon name="keyboard_arrow_right" /> }}
        mask
        maskClosable
        destroyOnHidden
        placement="right"
        width="100%"
        className="copilot-drawer"
        styles={{
          header: {
            borderBottom: 0,
            flex: "unset",
            padding: 10,
          },
          body: { padding: 0 },
        }}
      >
        <DebugTab />
      </Drawer>
    </header>
  );
};

const CopilotSidePanel: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { discardBTW } = useBTW();
  const { t } = useI18n();
  const debugPanelEnabled = isDebugPanelEnabled();
  const activeTab = state.rightSidebarOpenTab;

  if (!state.rightSidebarOpen || !activeTab) {
    return null;
  }

  if (activeTab === "debug" && !debugPanelEnabled) {
    return null;
  }

  const title =
    activeTab === "debug"
      ? t("copilot.panel.debug")
      : activeTab === "btw"
        ? t("btw.title")
        : activeTab === "preview"
        ? t("copilot.panel.preview")
        : activeTab === "sourceDetail"
          ? t("copilot.panel.sourceDetail")
          : activeTab === "planningPreview"
            ? t("copilot.panel.planningPreview")
            : activeTab === "web"
              ? t("copilot.panel.web")
            : t("copilot.panel.overview");

  return (
    <section className={COPILOT_SIDE_PANEL_CLASS} aria-label={title}>
      <div className={COPILOT_SIDE_PANEL_HEAD_CLASS}>
        <strong>{title}</strong>
        <UiButton
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t("copilot.panel.close")}
          title={t("copilot.panel.close")}
          onClick={() => {
            if (activeTab === "btw") {
              discardBTW(state.chatId);
            }
            dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
          }}
        >
          <MaterialIcon name="close" />
        </UiButton>
      </div>
      <div className={COPILOT_SIDE_PANEL_BODY_CLASS}>
        {activeTab === "debug" ? (
          <DebugTab />
        ) : activeTab === "btw" ? (
          <BtwTab />
        ) : activeTab === "preview" && state.attachmentPreview.length > 0 ? (
          state.attachmentPreview.map((p) => (
            <AttachmentPreviewPanel key={p.url} preview={p} />
          ))
        ) : activeTab === "sourceDetail" && state.activeSourceDetail ? (
          <SourceDetailTab />
        ) : activeTab === "planningPreview" && state.planningPreviews.length > 0 ? (
          state.planningPreviews.map((p) => (
            <PlanningPreviewTab key={p.nodeId} nodeId={p.nodeId} />
          ))
        ) : activeTab === "web" && state.webPreviews.length > 0 ? (
          <CopilotWebPreviewTabs />
        ) : (
          <OverviewTab />
        )}
      </div>
    </section>
  );
};

export const CopilotShell: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ agentKey?: string }>();
  const [searchParams] = useSearchParams();
  const lastRouteTargetKeyRef = useRef("");
  const requestedAgentKey = useMemo(
    () =>
      normalizeRouteValue(params.agentKey) ||
      normalizeRouteValue(searchParams.get("agentKey")),
    [params.agentKey, searchParams],
  );
  const resolvedAgentKey = useMemo(() => {
    const agents = Array.isArray(state.agents) ? state.agents : [];
    if (agents.length === 0) return "";

    if (requestedAgentKey) {
      const matched = agents.find(
        (agent) => normalizeRouteValue(agent?.key) === requestedAgentKey,
      );
      if (matched?.key) return normalizeRouteValue(matched.key);
    }

    return normalizeRouteValue(agents[0]?.key);
  }, [requestedAgentKey, state.agents]);
  const routeChatId = useMemo(
    () => normalizeRouteValue(searchParams.get("chatId")),
    [searchParams],
  );
  const currentCopilotRoute = useMemo(() => {
    const currentSearch = searchParams.toString();
    return `${location.pathname}${currentSearch ? `?${currentSearch}` : ""}`;
  }, [location.pathname, searchParams]);

  useAppRuntimes();

  useEffect(() => {
    if (!resolvedAgentKey) {
      lastRouteTargetKeyRef.current = "";
      return;
    }

    const routeTargetKey = createCopilotRouteTargetKey(
      resolvedAgentKey,
      routeChatId,
    );
    if (lastRouteTargetKeyRef.current === routeTargetKey) {
      return;
    }
    lastRouteTargetKeyRef.current = routeTargetKey;

    if (resolvedAgentKey) {
      const workerKey = `agent:${resolvedAgentKey}`;
      dispatch({ type: "SET_CONVERSATION_MODE", mode: "worker" });
      dispatch({ type: "SET_WORKER_SELECTION_KEY", workerKey });
      dispatch({ type: "SET_WORKER_PRIORITY_KEY", workerKey });
      dispatch({
        type: "SET_PENDING_NEW_CHAT_AGENT_KEY",
        agentKey: resolvedAgentKey,
      });
    }

    if (routeChatId) {
      window.dispatchEvent(
        new CustomEvent("agent:load-chat", {
          detail: {
            chatId: routeChatId,
            focusComposerOnComplete: true,
          },
        }),
      );
      return;
    }

    window.dispatchEvent(
      new CustomEvent("agent:start-new-conversation", {
        detail: {
          agentKey: resolvedAgentKey,
          preserveWorkerContext: true,
          focusComposerOnComplete: true,
        },
      }),
    );
  }, [dispatch, resolvedAgentKey, routeChatId]);

  useEffect(() => {
    const navigateToHandledConversation = (
      targetAgentKey: string,
      targetChatId: string,
      replace: boolean,
    ) => {
      const nextRoute = createCopilotChatRoute(
        targetAgentKey,
        searchParams,
        targetChatId,
      );
      if (!nextRoute || nextRoute === currentCopilotRoute) {
        return;
      }

      lastRouteTargetKeyRef.current = createCopilotRouteTargetKey(
        targetAgentKey,
        targetChatId,
      );
      if (replace) {
        navigate(nextRoute, { replace: true });
      } else {
        navigate(nextRoute);
      }
    };

    const handleNewChatCreated = (event: Event) => {
      const detail = ((event as CustomEvent).detail ||
        {}) as CopilotConversationRouteEventDetail;
      const chatId = normalizeRouteValue(String(detail.chatId || ""));
      const agentKey =
        normalizeRouteValue(String(detail.agentKey || "")) || resolvedAgentKey;
      if (!agentKey || !chatId) {
        return;
      }
      navigateToHandledConversation(agentKey, chatId, true);
    };

    const handleLoadChat = (event: Event) => {
      const detail = ((event as CustomEvent).detail ||
        {}) as CopilotConversationRouteEventDetail;
      const chatId = normalizeRouteValue(String(detail.chatId || ""));
      const agentKey =
        normalizeRouteValue(String(detail.agentKey || "")) || resolvedAgentKey;
      if (!agentKey || !chatId) {
        return;
      }
      navigateToHandledConversation(agentKey, chatId, false);
    };

    const handleStartNewConversation = (event: Event) => {
      const detail = ((event as CustomEvent).detail ||
        {}) as CopilotConversationRouteEventDetail;
      const agentKey =
        normalizeRouteValue(String(detail.agentKey || "")) || resolvedAgentKey;
      if (!agentKey || !routeChatId) {
        return;
      }
      navigateToHandledConversation(agentKey, "", false);
    };

    window.addEventListener("agent:new-chat-created", handleNewChatCreated);
    window.addEventListener("agent:load-chat", handleLoadChat);
    window.addEventListener(
      "agent:start-new-conversation",
      handleStartNewConversation,
    );
    return () => {
      window.removeEventListener("agent:new-chat-created", handleNewChatCreated);
      window.removeEventListener("agent:load-chat", handleLoadChat);
      window.removeEventListener(
        "agent:start-new-conversation",
        handleStartNewConversation,
      );
    };
  }, [
    currentCopilotRoute,
    navigate,
    resolvedAgentKey,
    routeChatId,
    searchParams,
  ]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = ((event as CustomEvent).detail || {}) as {
        workerKey?: unknown;
        agentKey?: unknown;
      };
      const explicitAgentKey = normalizeRouteValue(
        String(detail.agentKey || ""),
      );
      const workerKey = normalizeRouteValue(String(detail.workerKey || ""));
      const nextAgentKey = explicitAgentKey || (
        workerKey.startsWith("agent:")
          ? normalizeRouteValue(workerKey.slice("agent:".length))
          : ""
      );
      const nextPath = nextAgentKey
        ? createCopilotChatRoute(nextAgentKey, searchParams)
        : "/copilot";

      if (currentCopilotRoute !== nextPath) {
        navigate(nextPath);
      }
    };
    window.addEventListener("agent:select-worker", handler);
    return () => window.removeEventListener("agent:select-worker", handler);
  }, [currentCopilotRoute, navigate, searchParams]);

  return (
    <SettingsOverlayProvider>
      <CommandOverlayProvider>
        <GlobalShortcutLayer />
        <div className={COPILOT_SHELL_CLASS} id="app">
          <CopilotTopBar />
          <ConversationStage showEmptyState={false} />
          <BottomDock mode="copilot" />
          <CopilotSidePanel />
          <ShellOverlays
            commandOverlayVariant="copilot"
            settingsOverlayVariant="copilot"
          />
        </div>
      </CommandOverlayProvider>
    </SettingsOverlayProvider>
  );
};
