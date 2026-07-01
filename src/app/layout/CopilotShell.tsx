import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { resolveTopNavStatus } from "@/app/layout/TopNav";
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
  const statusTitle = statusDetail ? `${statusLabel}: ${statusDetail}` : statusLabel;

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
    <header className="copilot-topbar">
      <div className="copilot-topbar-row">
        <div className="copilot-title-block">
          <strong className="copilot-worker-name">
            {currentWorker?.displayName || t("topNav.noSelection")}
          </strong>
          <UiButton
            className="copilot-action-btn copilot-worker-switch-btn"
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
            className={`status-pill ${statusClass}`}
            id="copilot-api-status"
            title={statusTitle}
            aria-label={statusTitle}
          >
            {statusLabel}
          </span>
        </div>
        <div className="copilot-topbar-actions">
          <UiButton
            className="copilot-action-btn"
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
            className="copilot-action-btn"
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
              className="copilot-action-btn"
              variant="ghost"
              size="sm"
              iconOnly
              active={
                debugDrawerOpen ||
                (state.rightSidebarOpen && state.rightSidebarOpenTab === "debug")
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
            className="copilot-action-btn"
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
      {debugPanelEnabled && debugDrawerOpen ? (
        <>
          <button
            type="button"
            className="copilot-debug-drawer-backdrop"
            aria-label={t("copilot.panel.close")}
            onClick={() => setDebugDrawerOpen(false)}
          />
          <section
            className="copilot-debug-drawer"
            role="dialog"
            aria-label={t("copilot.panel.debug")}
          >
            <div className="copilot-debug-drawer-head">
              <strong>{t("copilot.panel.debug")}</strong>
              <UiButton
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={t("copilot.panel.close")}
                title={t("copilot.panel.close")}
                onClick={() => setDebugDrawerOpen(false)}
              >
                <MaterialIcon name="close" />
              </UiButton>
            </div>
            <div className="copilot-debug-drawer-body">
              <DebugTab />
            </div>
          </section>
        </>
      ) : null}
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
    <section className="copilot-side-panel" aria-label={title}>
      <div className="copilot-side-panel-head">
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
      <div className="copilot-side-panel-body">
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
    if (resolvedAgentKey && state.temporaryPinnedAgentKey === resolvedAgentKey) {
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
      dispatch({ type: "SET_PENDING_NEW_CHAT_AGENT_KEY", agentKey: resolvedAgentKey });
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
      const explicitAgentKey = normalizeRouteValue(String(detail.agentKey || ""));
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
        <div className="app-shell layout-copilot" id="app">
          <CopilotTopBar />
          <ConversationStage showEmptyState={false} />
          <BottomDock mode="copilot" />
          <CopilotSidePanel />
          <ShellOverlays commandOverlayVariant="copilot" />
        </div>
      </CommandOverlayProvider>
    </SettingsOverlayProvider>
  );
};
