import React, { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { CommandStatusOverlay } from "@/app/layout/CommandStatusOverlay";
import { resolveTopNavStatus } from "@/app/layout/TopNav";
import { useAppRuntimes } from "@/app/layout/hooks/useAppRuntimes";
import { AttachmentPreviewPanel } from "@/app/layout/sidebar/right/AttachmentPreviewPanel";
import { DebugTab } from "@/app/layout/sidebar/right/DebugTab";
import { OverviewTab } from "@/app/layout/sidebar/right/OverviewTab";
import { ActionModal } from "@/app/modals/ActionModal";
import { ArchiveModal } from "@/features/settings/components/ArchiveModal";
import { CommandModal } from "@/app/modals/CommandModal";
import { EventPopover } from "@/app/modals/EventPopover";
import { MemoryInfoModal } from "@/features/settings/components/MemoryInfoModal";
import { SettingsModal } from "@/features/settings/components/SettingsModal";
import { BottomDock } from "@/app/layout/BottomDock";
import { FireworksCanvas } from "@/app/effects/FireworksCanvas";
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
  const currentWorker = resolveCurrentWorkerSummary(state);
  const { statusClass, statusText } = resolveTopNavStatus(state);

  const handleStartNewConversation = () => {
    window.dispatchEvent(new CustomEvent("agent:start-new-conversation"));
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
            onClick={() =>
              dispatch({
                type: "OPEN_COMMAND_MODAL",
                modal: { type: "switch" },
              })
            }
          >
            <MaterialIcon name="swap_horiz" />
          </UiButton>
          <span className={`status-pill ${statusClass}`} id="copilot-api-status">
            {t(statusText)}
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
            onClick={() =>
              dispatch({
                type: "OPEN_COMMAND_MODAL",
                modal: { type: "history" },
              })
            }
          >
            <MaterialIcon name="history" />
          </UiButton>
          <UiButton
            className="copilot-action-btn"
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t("settings.title")}
            title={t("settings.title")}
            onClick={() => dispatch({ type: "SET_SETTINGS_OPEN", open: true })}
          >
            <MaterialIcon name="settings" />
          </UiButton>
        </div>
      </div>
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
    <div className="app-shell layout-copilot" id="app">
      <CopilotTopBar />
      <ConversationStage showEmptyState={false} />
      <BottomDock mode="copilot" />
      <CopilotSidePanel />
      <CommandStatusOverlay />
      {state.archiveOpen ? <ArchiveModal /> : null}
      {state.memoryInfoOpen ? <MemoryInfoModal /> : null}
      {state.settingsOpen && <SettingsModal />}
      <CommandModal variant="copilot" />
      <ActionModal />
      <EventPopover />
      <FireworksCanvas />
    </div>
  );
};
