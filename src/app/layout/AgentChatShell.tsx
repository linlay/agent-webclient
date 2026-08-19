import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import type { Agent, Chat, WorkerConversationRow } from "@/app/state/types";
import { TopNav } from "@/app/layout/TopNav";
import { BottomDock } from "@/app/layout/BottomDock";
import { ConversationStage } from "@/features/timeline/components/ConversationStage";
import { ShellOverlays } from "@/app/layout/ShellOverlays";
import { SettingsOverlayProvider } from "@/features/settings/components/SettingsOverlayProvider";
import { CommandOverlayProvider } from "@/features/workers/components/CommandOverlayProvider";
import { GlobalSearchOverlayProvider } from "@/features/search/components/GlobalSearchOverlayProvider";
import { useAppRuntimes } from "@/app/layout/hooks/useAppRuntimes";
import { SidebarHistorySection } from "@/app/layout/sidebar/SidebarHistorySection";
import { useLeftSidebarData } from "@/app/layout/hooks/useLeftSidebarData";
import { getAgent, getChats } from "@/shared/data";
import { ApiError } from "@/shared/data/api/client";
import { mergeFetchedChats } from "@/features/chats/lib/chatSummary";
import { useI18n } from "@/shared/i18n";
import { useDesktopActionForAgentPage } from "@/shared/hooks/agentPage/useDesktopAction";
import { upsertAgentSummary } from "@/features/workers/lib/agentSummary";
import { buildSurfaceRoute, readSurfacePresentationContext } from "@/features/surfaces/surfaceRoutes";

export function parseNewChatTimestamp(rawValue: unknown): string {
  const timestamp = String(rawValue || "").trim();
  return /^[1-9]\d{12}$/.test(timestamp) ? timestamp : "";
}

export type ComposerIntent = "find-skill" | "create-skill";

const COMPOSER_INTENT_MESSAGE_KEYS = {
  "find-skill": "composer.intent.findSkill",
  "create-skill": "composer.intent.createSkill",
} as const;

export function parseComposerIntent(rawValue: unknown): ComposerIntent | "" {
  const intent = String(rawValue || "").trim();
  return intent === "find-skill" || intent === "create-skill" ? intent : "";
}

export function composerIntentMessageKey(intent: ComposerIntent) {
  return COMPOSER_INTENT_MESSAGE_KEYS[intent];
}

export function createConsumedComposerIntentRoute(
  agentKey: string,
  searchParams: URLSearchParams,
): string {
  const normalizedAgentKey = String(agentKey || "").trim();
  if (!normalizedAgentKey) {
    return "";
  }
  const nextSearchParams = new URLSearchParams(searchParams);
  nextSearchParams.delete("composerIntent");
  const search = nextSearchParams.toString();
  return `/agent/${encodeURIComponent(normalizedAgentKey)}${search ? `?${search}` : ""}`;
}

export function createNewChatRouteKey(
  agentKey: string,
  newChatTimestamp: string,
): string {
  return `${agentKey}\u0000${newChatTimestamp}`;
}

export function createChatRouteKey(agentKey: string, chatId: string): string {
  const normalizedAgentKey = String(agentKey || "").trim();
  const normalizedChatId = String(chatId || "").trim();
  return normalizedAgentKey && normalizedChatId
    ? `${normalizedAgentKey}\u0000${normalizedChatId}`
    : "";
}

/** Consume the one-shot marker created by a `newChat` live-session promotion. */
export function consumeLiveSessionPromotion(
  promotions: Set<string>,
  agentKey: string,
  chatId: string,
): boolean {
  const routeKey = createChatRouteKey(agentKey, chatId);
  return Boolean(routeKey && promotions.delete(routeKey));
}

export function createResolvedNewChatRoute(
  agentKey: string,
  searchParams: URLSearchParams,
  chatId: string,
): string {
  const normalizedAgentKey = String(agentKey || "").trim();
  const normalizedChatId = String(chatId || "").trim();
  if (!normalizedAgentKey || !normalizedChatId) {
    return "";
  }

  return buildSurfaceRoute(
    { kind: "agent", agentKey: normalizedAgentKey, chatId: normalizedChatId },
    readSurfacePresentationContext(searchParams.toString()),
  );
}

type NewChatCreatedEventDetail = {
  chatId?: unknown;
  agentKey?: unknown;
};

export function isAgentRouteAuthenticationError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

const NEW_CHAT_CREATED_EVENT = "agent:new-chat-created";

const AGENT_ROUTE_LOADING_PAGE_CLASS =
  "agent-route-loading-page tw:grid tw:min-h-screen tw:place-items-center tw:bg-bg-base tw:p-6 tw:text-ink-1";
const AGENT_ROUTE_LOADING_OVERLAY_CLASS =
  "agent-route-loading-page agent-route-loading-overlay tw:absolute tw:inset-0 tw:z-20 tw:grid tw:place-items-center tw:bg-bg-base tw:p-6 tw:text-ink-1";
const AGENT_ROUTE_LOADING_CARD_CLASS =
  "agent-route-loading-card tw:inline-flex tw:min-w-[min(320px,100%)] tw:items-center tw:gap-3.5 tw:px-5 tw:py-[18px]";
const AGENT_ROUTE_LOADING_SPINNER_CLASS =
  "agent-route-loading-spinner tw:h-7 tw:w-7 tw:animate-ui-spin tw:rounded-full tw:border-[3px] tw:[border-color:color-mix(in_srgb,var(--accent)_22%,transparent)] tw:[border-top-color:var(--accent)]";
const AGENT_ROUTE_LOADING_COPY_CLASS =
  "agent-route-loading-copy tw:flex tw:min-w-0 tw:flex-col tw:gap-1 tw:[&_span]:overflow-hidden tw:[&_span]:text-ellipsis tw:[&_span]:whitespace-nowrap tw:[&_span]:text-xs tw:[&_span]:text-ink-muted tw:[&_strong]:text-sm tw:[&_strong]:font-bold";
const AGENT_ROUTE_SHELL_BASE_CLASS =
  "app-shell layout-desktop-fixed layout-agent-route tw:relative tw:grid tw:h-screen tw:overflow-hidden tw:bg-bg-base tw:grid-cols-[0_minmax(0,1fr)] tw:grid-rows-[auto_minmax(0,1fr)_auto] tw:[&_.bottom-dock]:col-start-2 tw:[&_.bottom-dock]:row-start-3 tw:[&_.conversation-stage]:col-start-2 tw:[&_.conversation-stage]:row-start-2 tw:[&_.drawer-close]:hidden tw:[&_.left-sidebar]:hidden";
const AGENT_ROUTE_ROW_CLASS_BY_STATE = {
  default: "tw:grid-rows-[auto_minmax(0,1fr)_auto]",
  empty: "timeline-empty-layout tw:grid-rows-[auto_minmax(0,2fr)_minmax(0,3fr)_auto]",
} as const;

function hasRouteAgentDetailSignal(agent: Agent | undefined): boolean {
  if (!agent) return false;
  return Boolean(
    String(agent.mode || "").trim() || String(agent.type || "").trim(),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function needsRouteAgentModelOptionsHydration(agent: Agent | undefined): boolean {
  if (!agent) return false;
  const meta = isRecord(agent.meta) ? agent.meta : {};
  const mode = String(agent.mode || meta.mode || "").trim().toUpperCase();
  const type = String(agent.type || "").trim().toLowerCase();
  const acpBridgeId = String(meta.acpBridgeId || agent.acpBridgeId || "").trim();
  if (!acpBridgeId || (mode !== "CODER" && type !== "coder")) {
    return false;
  }
  return !hasOwn(agent, "modelOptions");
}

const AgentRouteLoadingPage: React.FC<{ title: string; overlay?: boolean }> = ({ title, overlay = false }) => {
  const Component = overlay ? "div" : "main";
  return (
    <Component
      className={overlay ? AGENT_ROUTE_LOADING_OVERLAY_CLASS : AGENT_ROUTE_LOADING_PAGE_CLASS}
      aria-busy="true"
    >
      <div className={AGENT_ROUTE_LOADING_CARD_CLASS}>
        <div className={AGENT_ROUTE_LOADING_SPINNER_CLASS} aria-hidden="true" />
        <div className={AGENT_ROUTE_LOADING_COPY_CLASS}>
          <strong>{title}</strong>
        </div>
      </div>
    </Component>
  );
};

const AGENT_ROUTE_ERROR_CARD_CLASS =
  "tw:inline-flex tw:min-w-[min(360px,100%)] tw:flex-col tw:items-center tw:gap-4 tw:px-6 tw:py-6";
const AGENT_ROUTE_ERROR_ICON_CLASS =
  "tw:flex tw:h-12 tw:w-12 tw:items-center tw:justify-center tw:rounded-full tw:bg-[color-mix(in_srgb,var(--ink-danger)_12%,transparent)] tw:text-[var(--ink-danger)] tw:text-2xl";
const AGENT_ROUTE_ERROR_COPY_CLASS =
  "tw:flex tw:flex-col tw:items-center tw:gap-1.5 tw:text-center";
const AGENT_ROUTE_ERROR_RETRY_BUTTON_CLASS =
  "tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-[color-mix(in_srgb,var(--accent)_30%,transparent)] tw:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:transition-colors tw:hover:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]";

const AgentRouteErrorPage: React.FC<{
  message: string;
  description: string;
  retryLabel: string;
  onRetry: () => void;
}> = ({ message, description, retryLabel, onRetry }) => (
  <main className={AGENT_ROUTE_LOADING_PAGE_CLASS}>
    <div className={AGENT_ROUTE_ERROR_CARD_CLASS}>
      <div className={AGENT_ROUTE_ERROR_ICON_CLASS} aria-hidden="true">
        !
      </div>
      <div className={AGENT_ROUTE_ERROR_COPY_CLASS}>
        <strong className="tw:text-sm tw:text-ink-1">
          {message}
        </strong>
        <span className="tw:text-xs tw:text-ink-muted">
          {description}
        </span>
      </div>
      <button
        type="button"
        className={AGENT_ROUTE_ERROR_RETRY_BUTTON_CLASS}
        onClick={onRetry}
      >
        <svg
          className="tw:h-4 tw:w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        {retryLabel}
      </button>
    </div>
  </main>
);

export const AgentChatShell: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const navigate = useNavigate();
  const params = useParams<{ agentKey?: string }>();
  const [searchParams] = useSearchParams();
  const [historyWorkerKey, setHistoryWorkerKey] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [remoteHistoryRows, setRemoteHistoryRows] = useState<
    WorkerConversationRow[] | null
  >(null);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyInputRef = useRef<HTMLInputElement>(null);
  const historyListRef = useRef<HTMLDivElement>(null);
  const historyItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const stateRef = useRef(state);
  const lastInitializedAgentKeyRef = useRef("");
  const lastLoadedChatKeyRef = useRef("");
  const promotedLiveChatRouteKeysRef = useRef<Set<string>>(new Set());
  const consumedComposerIntentKeysRef = useRef<Set<string>>(new Set());
  const routeAgentHydratedWithoutSignalRef = useRef<Set<string>>(new Set());
  const routeAgentHydrationFailedRef = useRef<Set<string>>(new Set());
  const routeAgentHydrationRequestRef = useRef(0);
  const routeAgentLoadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [routeAgentLoadError, setRouteAgentLoadError] = useState<string | null>(null);
  const [routeAgentLoadErrorDescription, setRouteAgentLoadErrorDescription] = useState("");
  const [hydrationRetryCount, setHydrationRetryCount] = useState(0);
  const agentKey = useMemo(
    () => String(params.agentKey || "").trim(),
    [params.agentKey],
  );
  const routeWorkerKey = useMemo(
    () => (agentKey ? `agent:${agentKey}` : ""),
    [agentKey],
  );
  const chatId = useMemo(
    () => String(searchParams.get("chatId") || "").trim(),
    [searchParams],
  );
  const routeNewChatTimestamp = useMemo(
    () => parseNewChatTimestamp(searchParams.get("newChat")),
    [searchParams],
  );
  const routeComposerIntent = useMemo(
    () => parseComposerIntent(searchParams.get("composerIntent")),
    [searchParams],
  );
  const routeAgent = useMemo(
    () =>
      state.agents.find(
        (agent) => String(agent?.key || "").trim() === agentKey,
      ),
    [agentKey, state.agents],
  );
  const routeAgentHasDetailSignal = hasRouteAgentDetailSignal(routeAgent);
  const routeAgentNeedsModelOptionsHydration =
    needsRouteAgentModelOptionsHydration(routeAgent);
  const routeAgentHydrated =
    !agentKey ||
    Boolean(
      routeAgent &&
        ((routeAgentHasDetailSignal && !routeAgentNeedsModelOptionsHydration) ||
          routeAgentHydratedWithoutSignalRef.current.has(agentKey) ||
          routeAgentHydrationFailedRef.current.has(agentKey)),
    );
  const routeAgentNeedsHydration =
    Boolean(agentKey) &&
    (!routeAgent ||
      ((!routeAgentHasDetailSignal || routeAgentNeedsModelOptionsHydration) &&
        !routeAgentHydratedWithoutSignalRef.current.has(agentKey) &&
        !routeAgentHydrationFailedRef.current.has(agentKey)));
  const routeAgentReady =
    routeAgentHydrated &&
    (!agentKey || state.workerSelectionKey === routeWorkerKey);
  const currentStateChatId = String(state.chatId || "").trim();
  const routeHasVisibleConversation =
    Boolean(chatId) &&
    !currentStateChatId &&
    state.workerSelectionKey === routeWorkerKey &&
    (state.timelineOrder.length > 0 || state.streaming || Boolean(state.runId));
  const routeChatReady =
    !chatId || currentStateChatId === chatId || routeHasVisibleConversation;
  const { filteredHistoryRows, workerChatsByKey, workerIconsByKey } = useLeftSidebarData({
    agents: state.agents,
    chatFilter: state.chatFilter,
    chats: state.chats,
    historySearch,
    historyWorkerKey,
    teams: state.teams,
    temporaryPinnedAgentKey: state.temporaryPinnedAgentKey,
    workerRows: state.workerRows,
  });
  const historyWorker =
    state.workerIndexByKey.get(historyWorkerKey) ||
    state.workerRows.find((row) => row.key === historyWorkerKey) ||
    null;
  const hasVisibleConversationContent =
    state.timelineOrder.length > 0 || state.streaming || Boolean(state.runId);

  const { refreshWorkerData } = useAppRuntimes({
    initialWorkerRefreshEnabled: false,
  });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function"
    ) {
      return;
    }

    const handleSelectWorker = (event: Event) => {
      const detail = ((event as CustomEvent).detail || {}) as {
        agentKey?: unknown;
        workerKey?: unknown;
      };
      const explicitAgentKey = String(detail.agentKey || "").trim();
      const workerKey = String(detail.workerKey || "").trim();
      const nextAgentKey =
        explicitAgentKey ||
        (workerKey.startsWith("agent:")
          ? workerKey.slice("agent:".length).trim()
          : "");
      if (!nextAgentKey || nextAgentKey === agentKey) {
        return;
      }

      navigate(buildSurfaceRoute(
        { kind: "agent", agentKey: nextAgentKey },
        readSurfacePresentationContext(searchParams.toString()),
      ));
    };

    window.addEventListener("agent:select-worker", handleSelectWorker);
    return () => {
      window.removeEventListener("agent:select-worker", handleSelectWorker);
    };
  }, [agentKey, navigate, searchParams]);

  useEffect(() => {
    if (
      !agentKey ||
      chatId ||
      !routeNewChatTimestamp ||
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function"
    ) {
      return;
    }

    let handled = false;
    const handleNewChatCreated = (event: Event) => {
      if (handled) {
        return;
      }

      const detail = ((event as CustomEvent).detail || {}) as NewChatCreatedEventDetail;
      const chatId = String(detail.chatId || "").trim();
      const resolvedAgentKey = String(detail.agentKey || agentKey).trim();
      const route = createResolvedNewChatRoute(
        resolvedAgentKey,
        searchParams,
        chatId,
      );
      if (!route) {
        return;
      }

      handled = true;
      promotedLiveChatRouteKeysRef.current.add(
        createChatRouteKey(resolvedAgentKey, chatId),
      );
      navigate(route, { replace: true });
    };

    window.addEventListener(NEW_CHAT_CREATED_EVENT, handleNewChatCreated);
    return () => {
      window.removeEventListener(NEW_CHAT_CREATED_EVENT, handleNewChatCreated);
    };
  }, [agentKey, chatId, navigate, routeNewChatTimestamp, searchParams]);

  const handleRetryRouteAgent = useCallback(() => {
    routeAgentHydrationFailedRef.current.delete(agentKey);
    routeAgentHydratedWithoutSignalRef.current.delete(agentKey);
    setRouteAgentLoadError(null);
    setRouteAgentLoadErrorDescription("");
    setHydrationRetryCount((c) => c + 1);
  }, [agentKey]);

  useEffect(() => {
    if (!agentKey) {
      return;
    }

    if (!routeAgentNeedsHydration) {
      return;
    }

    const requestId = routeAgentHydrationRequestRef.current + 1;
    routeAgentHydrationRequestRef.current = requestId;
    let cancelled = false;

    if (routeAgentLoadingTimeoutRef.current) {
      clearTimeout(routeAgentLoadingTimeoutRef.current);
      routeAgentLoadingTimeoutRef.current = null;
    }

    routeAgentLoadingTimeoutRef.current = setTimeout(() => {
      if (cancelled) return;
      setRouteAgentLoadError(t("agentRoute.error.loadFailed"));
      setRouteAgentLoadErrorDescription(t("agentRoute.error.networkHint"));
    }, 15_000);

    void getAgent(agentKey)
      .then((response) => {
        if (
          cancelled ||
          routeAgentHydrationRequestRef.current !== requestId
        ) {
          return;
        }

        if (routeAgentLoadingTimeoutRef.current) {
          clearTimeout(routeAgentLoadingTimeoutRef.current);
          routeAgentLoadingTimeoutRef.current = null;
        }
        setRouteAgentLoadError(null);
        setRouteAgentLoadErrorDescription("");

        const payload = (response.data || {}) as unknown as Partial<Agent>;
        const resolvedAgentKey =
          String(payload.key || agentKey).trim() || agentKey;
        const patch: Partial<Agent> & Pick<Agent, "key"> = {
          ...payload,
          key: resolvedAgentKey,
        };
        if (!hasRouteAgentDetailSignal(patch as Agent)) {
          routeAgentHydratedWithoutSignalRef.current.add(resolvedAgentKey);
        } else {
          routeAgentHydratedWithoutSignalRef.current.delete(resolvedAgentKey);
        }

        const mergedAgents = upsertAgentSummary(
          stateRef.current.agents,
          patch,
        );
        dispatch({ type: "SET_AGENTS", agents: mergedAgents });
      })
      .catch((error) => {
        if (
          cancelled ||
          routeAgentHydrationRequestRef.current !== requestId
        ) {
          return;
        }

        if (routeAgentLoadingTimeoutRef.current) {
          clearTimeout(routeAgentLoadingTimeoutRef.current);
          routeAgentLoadingTimeoutRef.current = null;
        }

        routeAgentHydrationFailedRef.current.add(agentKey);
        const unauthorized = isAgentRouteAuthenticationError(error);
        setRouteAgentLoadError(t(unauthorized
          ? "agentRoute.error.authenticationRequired"
          : "agentRoute.error.loadFailed"));
        setRouteAgentLoadErrorDescription(t(unauthorized
          ? "agentRoute.error.authenticationHint"
          : "agentRoute.error.networkHint"));
        dispatch({
          type: "APPEND_DEBUG",
          line: `[loadAgent error] ${(error as Error).message}`,
        });
      });

    return () => {
      cancelled = true;
      if (routeAgentLoadingTimeoutRef.current) {
        clearTimeout(routeAgentLoadingTimeoutRef.current);
        routeAgentLoadingTimeoutRef.current = null;
      }
    };
  }, [agentKey, dispatch, routeAgentNeedsHydration, hydrationRetryCount, t]);

  useEffect(() => {
    if (!agentKey || !routeAgentHydrated) {
      return;
    }

    dispatch({ type: "SET_WORKER_SELECTION_KEY", workerKey: routeWorkerKey });
    dispatch({ type: "SET_WORKER_PRIORITY_KEY", workerKey: routeWorkerKey });
    dispatch({ type: "SET_PENDING_NEW_CHAT_AGENT_KEY", agentKey });

    if (chatId) {
      const routeKey = createChatRouteKey(agentKey, chatId);
      if (lastLoadedChatKeyRef.current === routeKey) {
        return;
      }
      lastLoadedChatKeyRef.current = routeKey;
      lastInitializedAgentKeyRef.current = "";
      if (
        consumeLiveSessionPromotion(
          promotedLiveChatRouteKeysRef.current,
          agentKey,
          chatId,
        )
      ) {
        return;
      }
      window.dispatchEvent(
        new CustomEvent("agent:load-chat", {
          detail: {
            chatId,
            focusComposerOnComplete: true,
          },
        }),
      );
      return;
    }

    if (!routeNewChatTimestamp) {
      lastInitializedAgentKeyRef.current = "";
      lastLoadedChatKeyRef.current = "";
      window.dispatchEvent(new CustomEvent("agent:focus-composer"));
      return;
    }

    const routeNewChatKey = createNewChatRouteKey(
      agentKey,
      routeNewChatTimestamp,
    );
    if (lastInitializedAgentKeyRef.current === routeNewChatKey) {
      return;
    }
    lastInitializedAgentKeyRef.current = routeNewChatKey;
    lastLoadedChatKeyRef.current = "";
    window.dispatchEvent(
      new CustomEvent("agent:start-new-conversation", {
        detail: {
          agentKey,
          preserveWorkerContext: true,
          focusComposerOnComplete: true,
        },
      }),
    );
  }, [
    agentKey,
    chatId,
    dispatch,
    routeAgentHydrated,
    routeNewChatTimestamp,
    routeWorkerKey,
  ]);

  useEffect(() => {
    if (
      !agentKey ||
      chatId ||
      !routeAgentHydrated ||
      !routeNewChatTimestamp ||
      !routeComposerIntent
    ) {
      return;
    }

    const intentKey = `${createNewChatRouteKey(
      agentKey,
      routeNewChatTimestamp,
    )}\u0000${routeComposerIntent}`;
    if (consumedComposerIntentKeysRef.current.has(intentKey)) {
      return;
    }
    consumedComposerIntentKeysRef.current.add(intentKey);

    window.dispatchEvent(
      new CustomEvent("agent:set-composer-draft", {
        detail: {
          draft: t(composerIntentMessageKey(routeComposerIntent)),
        },
      }),
    );
    window.dispatchEvent(new CustomEvent("agent:focus-composer"));

    const consumedRoute = createConsumedComposerIntentRoute(agentKey, searchParams);
    if (consumedRoute) {
      navigate(consumedRoute, { replace: true });
    }
  }, [
    agentKey,
    chatId,
    navigate,
    routeAgentHydrated,
    routeComposerIntent,
    routeNewChatTimestamp,
    searchParams,
    t,
  ]);

  const openRouteHistoryForWorker = useCallback(
    (workerKey: string) => {
      const normalizedWorkerKey = String(workerKey || "").trim();
      if (!normalizedWorkerKey) return;
      const workerChats = workerChatsByKey.get(normalizedWorkerKey) || [];
      const currentChatIndex = workerChats.findIndex(
        (row) =>
          String(row.chatId || "") === String(stateRef.current.chatId || ""),
      );
      setHistoryWorkerKey(normalizedWorkerKey);
      setHistorySearch("");
      setRemoteHistoryRows(null);
      setHistoryIndex(currentChatIndex >= 0 ? currentChatIndex : 0);

      void refreshWorkerData()
        .then(() => {
          const worker =
            stateRef.current.workerIndexByKey.get(normalizedWorkerKey) ||
            stateRef.current.workerRows.find(
              (item) => item.key === normalizedWorkerKey,
            );
          if (!worker) return null;
          return getChats(
            worker.type === "agent" ? { agentKey: worker.sourceId } : undefined,
          );
        })
        .then((response) => {
          if (!response) return;
          const fetchedChats = (
            Array.isArray(response.data) ? response.data : []
          ) as Chat[];
          const chats = mergeFetchedChats(stateRef.current.chats, fetchedChats);
          dispatch({ type: "SET_CHATS", chats });
        })
        .catch((error) => {
          dispatch({
            type: "APPEND_DEBUG",
            line: `[loadChats error] ${(error as Error).message}`,
          });
        });
    },
    [dispatch, refreshWorkerData, workerChatsByKey],
  );

  useDesktopActionForAgentPage({
    onOpenChatHistory: ({ workerKey }) => {
      openRouteHistoryForWorker(workerKey);
    },
  });

  useEffect(() => {
    if (!historyWorkerKey) return;
    historyInputRef.current?.focus();
    historyInputRef.current?.select();
  }, [historyWorkerKey]);

  const handleCloseHistory = () => {
    setHistoryWorkerKey("");
    setHistorySearch("");
    setHistoryIndex(0);
    setRemoteHistoryRows(null);
  };

  const handleHistoryWorkerChange = (workerKey: string) => {
    const normalizedWorkerKey = String(workerKey || "").trim();
    if (!normalizedWorkerKey || normalizedWorkerKey === historyWorkerKey) return;
    openRouteHistoryForWorker(normalizedWorkerKey);
    setHistoryIndex(0);
  };

  const handleSelectHistoryChat = (selectedChatId: string) => {
    window.dispatchEvent(
      new CustomEvent("agent:load-chat", {
        detail: {
          chatId: selectedChatId,
          focusComposerOnComplete: true,
        },
      }),
    );
  };

  const isTimelineEmpty = useMemo(() => !state.chatId, [state.chatId]);

  if (!routeAgentReady) {
    if (routeAgentLoadError) {
      return <AgentRouteErrorPage
        message={routeAgentLoadError}
        description={routeAgentLoadErrorDescription}
        retryLabel={t("agentRoute.error.retry")}
        onRetry={handleRetryRouteAgent}
      />;
    }
    return <AgentRouteLoadingPage title={t("agentRoute.loading.agent")} />;
  }

  const rowClass = isTimelineEmpty
    ? AGENT_ROUTE_ROW_CLASS_BY_STATE.empty
    : AGENT_ROUTE_ROW_CLASS_BY_STATE.default;

  return (
    <SettingsOverlayProvider>
      <CommandOverlayProvider>
        <GlobalSearchOverlayProvider>
        <div
          className={[
            AGENT_ROUTE_SHELL_BASE_CLASS,
            rowClass,
          ]
            .filter(Boolean)
            .join(" ")}
          id="app"
        >
          {!routeChatReady && !hasVisibleConversationContent ? (
            <AgentRouteLoadingPage title={t("agentRoute.loading.chat")} overlay />
          ) : null}
          <TopNav surface="agent" />
          <ConversationStage showEmptyState={!chatId} />
          <BottomDock />
          <ShellOverlays />
          <SidebarHistorySection
            open={Boolean(historyWorkerKey)}
            historyWorker={historyWorker}
            workerRows={state.workerRows}
            workerIconsByKey={workerIconsByKey}
            historyRows={remoteHistoryRows ?? filteredHistoryRows}
            historyIndex={historyIndex}
            historySearch={historySearch}
            historyInputRef={historyInputRef}
            historyListRef={historyListRef}
            historyItemRefs={historyItemRefs}
            onClose={handleCloseHistory}
            onHistoryWorkerChange={handleHistoryWorkerChange}
            onHistorySearchChange={(value) => {
              setHistorySearch(value);
              setHistoryIndex(0);
              if (!value.trim()) {
                setRemoteHistoryRows(null);
              }
            }}
            onActivateIndex={setHistoryIndex}
            onSelectChat={handleSelectHistoryChat}
            onChatDeleted={(deletedChatId) => {
              setRemoteHistoryRows((rows) =>
                rows
                  ? rows.filter((row) => String(row.chatId || "") !== deletedChatId)
                  : rows,
              );
            }}
          />
        </div>
      </GlobalSearchOverlayProvider>
      </CommandOverlayProvider>
    </SettingsOverlayProvider>
  );
};
