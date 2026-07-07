import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { Drawer } from "antd";
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
import { isDebugPanelEnabled } from "@/shared/config/featureFlags";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

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
  "copilot-side-panel-body tw:min-h-0 tw:flex-1 tw:overflow-auto tw:[&_.attachment-preview-panel]:h-full tw:[&_.debug-tab]:h-full tw:[&_.right-sidebar-overview]:h-full";

function normalizeRouteValue(value: string | null | undefined) {
  return String(value || "").trim();
}

const CopilotTopBar: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const { openOverlay } = useSettingsOverlayActions();
  const { openCommandOverlay } = useCommandOverlayActions();
  const currentWorker = resolveCurrentWorkerSummary(state);
  const { statusClass, statusText, statusDetail } = resolveTopNavStatus(state);
  const debugPanelEnabled = isDebugPanelEnabled();
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
            className={COPILOT_ACTION_BTN_CLASS}
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
        </div>
      </div>
      <Drawer
        open={debugPanelEnabled && debugDrawerOpen}
        onClose={() => setDebugDrawerOpen(false)}
        title={t("copilot.panel.debug")}
        closable={{ closeIcon: <MaterialIcon name="keyboard_arrow_down" /> }}
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
      : activeTab === "preview"
        ? t("copilot.panel.preview")
        : activeTab === "sourceDetail"
          ? t("copilot.panel.sourceDetail")
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
          onClick={() => dispatch({ type: "CLOSE_RIGHT_SIDEBAR" })}
        >
          <MaterialIcon name="close" />
        </UiButton>
      </div>
      <div className={COPILOT_SIDE_PANEL_BODY_CLASS}>
        {activeTab === "debug" ? (
          <DebugTab />
        ) : activeTab === "preview" && state.attachmentPreview ? (
          <AttachmentPreviewPanel />
        ) : activeTab === "sourceDetail" && state.activeSourceDetail ? (
          <SourceDetailTab />
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

  useAppRuntimes();

  useEffect(() => {
    if (
      resolvedAgentKey &&
      state.temporaryPinnedAgentKey === resolvedAgentKey
    ) {
      dispatch({ type: "SET_TEMPORARY_PINNED_AGENT_KEY", agentKey: "" });
    }
  }, [dispatch, resolvedAgentKey, state.temporaryPinnedAgentKey]);

  useEffect(() => {
    if (!resolvedAgentKey) {
      lastRouteTargetKeyRef.current = "";
      return;
    }

    const routeTargetKey = `${resolvedAgentKey}\u0000${routeChatId}`;
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
    const handler = (event: Event) => {
      const detail = ((event as CustomEvent).detail || {}) as {
        workerKey?: unknown;
        agentKey?: unknown;
      };
      const explicitAgentKey = normalizeRouteValue(
        String(detail.agentKey || ""),
      );
      const workerKey = normalizeRouteValue(String(detail.workerKey || ""));
      const nextPath = explicitAgentKey
        ? `/copilot/${encodeURIComponent(explicitAgentKey)}`
        : workerKey.startsWith("agent:")
          ? `/copilot/${encodeURIComponent(workerKey.slice("agent:".length))}`
          : "/copilot";

      if (location.pathname !== nextPath) {
        navigate(nextPath);
      }
    };
    window.addEventListener("agent:select-worker", handler);
    return () => window.removeEventListener("agent:select-worker", handler);
  }, [location.pathname, navigate]);

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
