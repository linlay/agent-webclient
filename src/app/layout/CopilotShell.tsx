import React, { useEffect, useMemo, useRef } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import {
  resolveStatusPillClassName,
  resolveTopNavStatus,
} from "@/app/layout/TopNav";
import { useAppRuntimes } from "@/app/layout/hooks/useAppRuntimes";
import { GlobalShortcutLayer } from "@/features/workers/hooks/useGlobalShortcuts";
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
import { isSettingsMenuEnabled } from "@/shared/config/featureFlags";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useOpenTarget } from "@/features/surfaces/openTarget";

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
  const openTarget = useOpenTarget();
  const currentWorker = resolveCurrentWorkerSummary(state);
  const { statusClass, statusText, statusDetail } = resolveTopNavStatus(state);
  const settingsMenuEnabled = isSettingsMenuEnabled();
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
            onClick={() => openTarget({ version: 1, kind: "history" })}
          >
            <MaterialIcon name="history" />
          </UiButton>
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
    </header>
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
    () => normalizeRouteValue(params.agentKey),
    [params.agentKey],
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
          <ShellOverlays
            commandOverlayVariant="copilot"
            settingsOverlayVariant="copilot"
          />
        </div>
      </CommandOverlayProvider>
    </SettingsOverlayProvider>
  );
};
