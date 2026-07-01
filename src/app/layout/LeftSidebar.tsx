import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  Checkbox,
  Collapse,
  CollapseProps,
  Dropdown,
  Flex,
  Input,
  message,
  Modal,
  Popover,
  Radio,
  Select,
  Spin,
} from "antd";
import { useAppContext } from "@/app/state/AppContext";
import type { AppAction } from "@/app/state/AppContext";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import {
  resolveSettingsSummaryBadges,
  SidebarSettingsMenu,
  type SidebarSettingsMenuAction,
} from "@/features/settings/components/SidebarSettingsMenu";
import { useSettingsOverlayActions } from "@/features/settings/components/SettingsOverlayProvider";
import { useCommandOverlayActions } from "@/features/workers/components/CommandOverlayProvider";
import {
  isQuickActionsEnabled,
  isSettingsMenuEnabled,
  isMemoryEnabled,
} from "@/shared/config/featureFlags";
import { useI18n } from "@/shared/i18n";
import { selectNavigationState } from "@/app/state/selectors";
import { AgentIcon } from "@/shared/icons/agent";
import { useLeftSidebarData } from "@/app/layout/hooks/useLeftSidebarData";
import type { WorkerSortMode } from "@/app/layout/hooks/useLeftSidebarData";
import { ChatItem } from "@/app/layout/sidebar/ChatItem";
import { WorkerPanelHeader } from "@/app/layout/sidebar/WorkerPanelHeader";
import { WorkerConversationPreviewList } from "@/app/layout/sidebar/WorkerConversationPreviewList";
import { SidebarHistorySection } from "@/app/layout/sidebar/SidebarHistorySection";
import {
  createAgent,
  deleteAgent,
  getAgent,
  getChats,
  getAgents,
  markChatRead,
  searchGlobal,
  updateAgent,
} from "@/shared/data";
import { mergeFetchedChats } from "@/features/chats/lib/chatSummary";
import {
  isChatActiveRun,
  isWorkerAttentionChat,
} from "@/features/chats/lib/chatRunState";
import type { AppState, Chat, WorkerConversationRow } from "@/app/state/types";
import { openWorkspaceDirectory } from "@/shared/data/desktopFileSystem";
import { buildWorkerRows } from "@/features/workers/lib/workerListFormatter";
import type { AgentDetailResponse } from "@/shared/data";
import { useActiveTerminalAgents } from "@/features/terminal/hooks/useActiveTerminalAgents";

function findChatIndex(rows: WorkerConversationRow[], chatId: string): number {
  const normalizedChatId = String(chatId || "").trim();
  if (!normalizedChatId) return -1;
  return rows.findIndex(
    (row) => String(row.chatId || "").trim() === normalizedChatId,
  );
}

function workspaceNameFromPath(path: string): string {
  const normalized = String(path || "").trim();
  return (
    normalized
      .split(/[\\/]+/)
      .filter(Boolean)
      .pop() || "project"
  );
}

export function buildCoderAgentCreateRequest(
  workspaceDir: string,
  options: { name?: string; acpProxyId?: string } = {},
) {
  const runtimeConfig: Record<string, unknown> = {
    workspaceRoot: workspaceDir,
  };
  if (options.acpProxyId) {
    runtimeConfig.acpProxyId = options.acpProxyId;
  }
  return {
    definition: {
      mode: "CODER",
      runtimeConfig,
    },
  };
}

export function buildKbaseAgentCreateRequest(
  workspaceDir: string,
  _options: { name?: string } = {},
) {
  return {
    definition: {
      mode: "KBASE",
      runtimeConfig: {
        workspaceRoot: workspaceDir,
      },
    },
  };
}

const ACP_PROXY_OPTIONS = [
  { value: "proxy-acp-claudecode", label: "claude" },
  { value: "proxy-acp-codex", label: "codex" },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeAgentMode(mode: unknown): string {
  const normalized = String(mode || "")
    .trim()
    .toUpperCase();
  return normalized || "REACT";
}

function buildFallbackAgentDefinition(
  detail: AgentDetailResponse,
): Record<string, unknown> {
  const definition: Record<string, unknown> = {
    key: detail.key,
    name: detail.name,
    icon: detail.icon,
    role: detail.role || "",
    description: detail.description || "",
    mode: normalizeAgentMode(detail.mode),
  };
  const meta = asRecord(detail.meta);
  const visibility = asRecord(meta.visibility);
  const budget = asRecord(meta.budget);
  const modelConfig = asRecord(detail.modelConfig);
  const modelKey = String(
    modelConfig.modelKey || meta.modelKey || detail.model || "",
  ).trim();
  if (modelKey || Object.keys(modelConfig).length > 0) {
    definition.modelConfig = {
      ...modelConfig,
      ...(modelKey ? { modelKey } : {}),
    };
  }
  if (Array.isArray(detail.tools))
    definition.toolConfig = { tools: detail.tools };
  if (Array.isArray(detail.skills))
    definition.skillConfig = { skills: detail.skills };
  if (Array.isArray(detail.wonders)) definition.wonders = detail.wonders;
  if (Array.isArray(detail.controls)) definition.controls = detail.controls;
  if (Array.isArray(visibility.scopes)) {
    definition.visibility = { scopes: visibility.scopes };
  }
  if (Object.keys(budget).length > 0) definition.budget = budget;
  return definition;
}

export async function handleCreateAgentSuccess(
  createdKey: string,
  dispatch: React.Dispatch<AppAction>,
  stateRef: React.MutableRefObject<AppState>,
) {
  if (!createdKey) return;

  dispatch({
    type: "SET_TEMPORARY_PINNED_AGENT_KEY",
    agentKey: createdKey,
  });

  const agentsResponse = await getAgents({
    includeChats: 5,
    scope: "nav",
  });
  const agents = Array.isArray(agentsResponse.data)
    ? (agentsResponse.data as AppState["agents"])
    : [];
  dispatch({ type: "SET_AGENTS", agents });

  dispatch({
    type: "SET_WORKER_ROWS",
    rows: buildWorkerRows({
      agents,
      teams: stateRef.current.teams,
      chats: stateRef.current.chats,
      workerPriorityKey: `agent:${createdKey}`,
    }),
  });
}

export const LeftSidebar: React.FC = () => {
  const { state, dispatch, querySessionsRef, stateRef } = useAppContext();
  const { t } = useI18n();
  const activeTerminalAgents = useActiveTerminalAgents();
  const navigate = useNavigate();
  const { openOverlay } = useSettingsOverlayActions();
  const { openCommandOverlay } = useCommandOverlayActions();
  const settingsMenuEnabled = isSettingsMenuEnabled();
  const quickActionsEnabled = isQuickActionsEnabled();
  const memoryEnabled = isMemoryEnabled();
  const navigation = selectNavigationState(state);
  const isSidebarLoading = navigation.sidebarPendingRequestCount > 0;
  const [expandedWorkerKey, setExpandedWorkerKey] = useState("");
  const [historyWorkerKey, setHistoryWorkerKey] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [remoteHistoryRows, setRemoteHistoryRows] = useState<
    WorkerConversationRow[] | null
  >(null);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [workerSortMode, setWorkerSortMode] =
    useState<WorkerSortMode>("byTime");
  const historyInputRef = useRef<HTMLInputElement>(null);
  const historyListRef = useRef<HTMLDivElement>(null);
  const historyItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const {
    filteredChats,
    filteredWorkerRows,
    workerIconsByKey,
    workerChatsByKey,
    workerUnreadCountByKey,
    workerTotalCountByKey,
    filteredHistoryRows,
  } = useLeftSidebarData({
    agents: state.agents,
    chatFilter: state.chatFilter,
    chats: state.chats,
    historySearch,
    historyWorkerKey,
    teams: state.teams,
    temporaryPinnedAgentKey: state.temporaryPinnedAgentKey,
    workerRows: state.workerRows,
    workerSortMode,
  });

  const historyWorker =
    state.workerIndexByKey.get(historyWorkerKey) ||
    state.workerRows.find((row) => row.key === historyWorkerKey) ||
    null;

  useEffect(() => {
    const query = historySearch.trim();
    if (!historyWorkerKey || !historyWorker || !query) {
      setRemoteHistoryRows(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const params =
        historyWorker.type === "team"
          ? { query, teamId: historyWorker.sourceId, limit: 30 }
          : { query, agentKey: historyWorker.sourceId, limit: 30 };
      void searchGlobal(params)
        .then((response) => {
          const results = Array.isArray(response.data?.results)
            ? response.data.results
            : [];
          setRemoteHistoryRows(
            results
              .map((result) => ({
                chatId: String(result.chatId || ""),
                chatName: String(result.chatName || result.chatId || ""),
                agentKey: result.agentKey,
                teamId: result.teamId,
                updatedAt: Number(result.timestamp) || 0,
                lastRunId: String(result.runId || ""),
                lastRunContent: String(result.snippet || ""),
                searchSnippet: String(result.snippet || ""),
                isRead: true,
              }))
              .filter((row) => row.chatId),
          );
        })
        .catch((error) => {
          dispatch({
            type: "APPEND_DEBUG",
            line: `[search error] ${(error as Error).message}`,
          });
          setRemoteHistoryRows([]);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [dispatch, historySearch, historyWorker, historyWorkerKey]);

  useEffect(() => {
    if (state.conversationMode !== "worker") {
      setExpandedWorkerKey("");
      return;
    }
    setExpandedWorkerKey(state.workerSelectionKey);
  }, [state.conversationMode, state.workerSelectionKey]);

  useEffect(() => {
    if (!historyWorkerKey) return;
    historyInputRef.current?.focus();
    historyInputRef.current?.select();
  }, [historyWorkerKey]);

  useEffect(() => {
    historyItemRefs.current[historyIndex]?.scrollIntoView({ block: "nearest" });
  }, [historyIndex]);

  useEffect(() => {
    if (!settingsMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSettingsMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [settingsMenuOpen]);

  const handleSelectChat = (chatId: string) => {
    window.dispatchEvent(
      new CustomEvent("agent:load-chat", { detail: { chatId } }),
    );
  };

  const handleSelectWorker = (workerKey: string) => {
    window.dispatchEvent(
      new CustomEvent("agent:select-worker", {
        detail: {
          workerKey,
          focusComposerOnComplete: true,
          preferNewChat: true,
        },
      }),
    );
  };

  const startNewConversationForWorker = (
    workerKey: string,
    options: { focusComposerOnComplete?: boolean } = {},
  ) => {
    const normalizedWorkerKey = String(workerKey || "").trim();
    const row =
      state.workerIndexByKey.get(normalizedWorkerKey) ||
      state.workerRows.find((item) => item.key === normalizedWorkerKey);
    if (!row) return;

    const workerChats = workerChatsByKey.get(normalizedWorkerKey) || [];
    flushSync(() => {
      dispatch({
        type: "SET_WORKER_SELECTION_KEY",
        workerKey: normalizedWorkerKey,
      });
      dispatch({ type: "SET_WORKER_RELATED_CHATS", chats: workerChats });
      dispatch({
        type: "SET_WORKER_CHAT_PANEL_COLLAPSED",
        collapsed: true,
      });
    });

    window.dispatchEvent(
      new CustomEvent("agent:start-new-conversation", {
        detail: {
          ...(row.type === "agent" ? { agentKey: row.sourceId } : {}),
          preserveWorkerContext: true,
          focusComposerOnComplete: Boolean(options.focusComposerOnComplete),
        },
      }),
    );
  };

  const handleStartNewConversationForWorker = (
    e: React.MouseEvent<HTMLElement>,
    workerKey: string,
  ) => {
    e.stopPropagation();
    startNewConversationForWorker(workerKey);
  };

  const handleSelectCollapsedWorker = (workerKey: string) => {
    const workerChats = workerChatsByKey.get(workerKey) || [];
    const runningChat = workerChats.find(isWorkerChatRunning);
    const latestChat = workerChats[0];
    const targetChat =
      runningChat ||
      (isWorkerAttentionChat(latestChat) ? latestChat : undefined);
    if (targetChat?.chatId) {
      window.dispatchEvent(
        new CustomEvent("agent:load-chat", {
          detail: {
            chatId: targetChat.chatId,
            focusComposerOnComplete: true,
          },
        }),
      );
      return;
    }

    startNewConversationForWorker(workerKey, { focusComposerOnComplete: true });
  };

  const handleWorkerCollapseChange = (key: string | string[]) => {
    const nextKey = Array.isArray(key)
      ? String(key[0] || "")
      : String(key || "");
    setExpandedWorkerKey(nextKey);
    if (nextKey) {
      handleSelectWorker(nextKey);
    }
  };

  const openHistoryForWorker = useCallback(
    (workerKey: string) => {
      const normalizedWorkerKey = String(workerKey || "").trim();
      if (!normalizedWorkerKey) return;
      const workerChats = workerChatsByKey.get(normalizedWorkerKey) || [];
      const currentChatIndex = findChatIndex(workerChats, state.chatId);
      setHistoryWorkerKey(normalizedWorkerKey);
      setHistorySearch("");
      setHistoryIndex(currentChatIndex >= 0 ? currentChatIndex : 0);

      const worker =
        state.workerIndexByKey.get(normalizedWorkerKey) ||
        state.workerRows.find((item) => item.key === normalizedWorkerKey);
      if (!worker || worker.type !== "agent") return;

      void getChats({ agentKey: worker.sourceId })
        .then((response) => {
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
    [
      dispatch,
      state.chatId,
      state.workerIndexByKey,
      state.workerRows,
      stateRef,
      workerChatsByKey,
    ],
  );

  const handleOpenHistory = (
    event: React.MouseEvent<Element>,
    workerKey: string,
  ) => {
    event.stopPropagation();
    openHistoryForWorker(workerKey);
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = ((event as CustomEvent).detail || {}) as {
        workerKey?: unknown;
        agentKey?: unknown;
      };
      const agentKey = String(detail.agentKey || "").trim();
      const workerKey = String(
        detail.workerKey || (agentKey ? `agent:${agentKey}` : ""),
      ).trim();
      openHistoryForWorker(workerKey);
    };
    window.addEventListener("agent:open-worker-history", handler);
    return () =>
      window.removeEventListener("agent:open-worker-history", handler);
  }, [openHistoryForWorker]);

  const handleMarkWorkerAllRead = async (
    event: React.MouseEvent<HTMLElement>,
    workerKey: string,
  ) => {
    event.stopPropagation();
    const row =
      state.workerIndexByKey.get(workerKey) ||
      state.workerRows.find((item) => item.key === workerKey);
    if (!row || row.type !== "agent") return;
    const agentKey = String(row.sourceId || "").trim();
    if (!agentKey) return;
    dispatch({ type: "MARK_AGENT_CHATS_READ", agentKey });
    try {
      await markChatRead({ agentKey });
    } catch (error) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[mark all read error] ${(error as Error).message}`,
      });
      window.dispatchEvent(new CustomEvent("agent:refresh-worker-data"));
    }
  };

  const handleOpenWorkspace = (workerKey: string) => {
    const row =
      state.workerIndexByKey.get(workerKey) ||
      state.workerRows.find((item) => item.key === workerKey);
    const workspaceDir = String(row?.workspaceDir || "").trim();
    if (!workspaceDir) {
      const message =
        row?.workspaceSourceKind === "browser-folder"
          ? t("leftSidebar.browserWorkspaceOpenUnavailable")
          : t("leftSidebar.workspaceUnavailable");
      dispatch({
        type: "APPEND_DEBUG",
        line: `[workspace] ${message}`,
      });
      return;
    }
    const agentKey = String(row?.sourceId || "").trim();
    void openWorkspaceDirectory(workspaceDir, agentKey)
      .then((opened) => {
        if (!opened) {
          dispatch({
            type: "APPEND_DEBUG",
            line: `[workspace] ${t("leftSidebar.workspaceUnavailable")}: ${workspaceDir}`,
          });
        }
      })
      .catch((error) => {
        dispatch({
          type: "APPEND_DEBUG",
          line: `[workspace open error] ${(error as Error).message}`,
        });
      });
  };

  const handleRenameAgent = (
    workerKey: string,
    agentKey: string,
    currentName: string,
  ) => {
    let nextName = currentName;
    Modal.confirm({
      title: t("leftSidebar.renameAgent"),
      content: (
        <Input
          autoFocus
          className="left-sidebar-rename-agent-input"
          defaultValue={currentName}
          maxLength={120}
          placeholder={t("leftSidebar.renameAgentPlaceholder")}
          onChange={(event) => {
            nextName = event.target.value;
          }}
        />
      ),
      okText: t("leftSidebar.renameAgent"),
      cancelText: t("chatActions.cancel"),
      onOk: async () => {
        const newName = nextName.trim();
        if (!newName) return;
        try {
          const detail = await getAgent(agentKey);
          const agentDetail = detail.data as AgentDetailResponse;
          const definition = {
            ...(agentDetail.definition ||
              buildFallbackAgentDefinition(agentDetail)),
            name: newName,
          };
          await updateAgent({ key: agentKey, definition });
          message.success(t("leftSidebar.renameAgentSuccess"));
          window.dispatchEvent(new CustomEvent("agent:refresh-worker-data"));
        } catch (error) {
          dispatch({
            type: "APPEND_DEBUG",
            line: `[rename agent error] ${(error as Error).message}`,
          });
          throw error;
        }
      },
    });
  };

  const handleEditAgent = (agentKey: string) => {
    const routeSearch = window.location.search || "";
    window.open(
      `/agents/${encodeURIComponent(agentKey)}${routeSearch}`,
      "_blank",
    );
  };

  const handleDeleteAgent = (workerKey: string, agentKey: string) => {
    const row =
      state.workerIndexByKey.get(workerKey) ||
      state.workerRows.find((item) => item.key === workerKey);
    const name = row?.displayName || agentKey;
    Modal.confirm({
      title: t("leftSidebar.deleteAgent"),
      content: t("leftSidebar.deleteAgentConfirm", { name }),
      okText: t("chatActions.delete.ok"),
      okButtonProps: { danger: true },
      cancelText: t("chatActions.cancel"),
      onOk: async () => {
        try {
          await deleteAgent({ key: agentKey });
          window.dispatchEvent(new CustomEvent("agent:refresh-worker-data"));
        } catch (error) {
          dispatch({
            type: "APPEND_DEBUG",
            line: `[delete agent error] ${(error as Error).message}`,
          });
          throw error;
        }
      },
    });
  };

  const handleCloseHistory = () => {
    setHistoryWorkerKey("");
    setHistorySearch("");
    setHistoryIndex(0);
    setRemoteHistoryRows(null);
  };

  const handleSettingsMenuAction = (action: SidebarSettingsMenuAction) => {
    if (action.type === "open-registries") {
      navigate(`/registries${window.location.search || ""}`);
      setSettingsMenuOpen(false);
      return;
    }
    if (action.type === "open-archive") {
      navigate(`/archives${window.location.search || ""}`);
      setSettingsMenuOpen(false);
      return;
    }
    if (action.type === "open-settings") {
      openOverlay("settings");
      setSettingsMenuOpen(false);
      return;
    }
    if (action.type === "open-memory-info") {
      openOverlay("memoryInfo");
      setSettingsMenuOpen(false);
      return;
    }
  };

  const hasStreamingSessionForChat = (chatId: string) => {
    const normalizedChatId = String(chatId || "").trim();
    if (!normalizedChatId) return false;
    for (const session of querySessionsRef.current.values()) {
      if (
        session.streaming &&
        String(session.chatId || "").trim() === normalizedChatId
      ) {
        return true;
      }
    }
    return false;
  };

  const getWorkerChatLoading = (chatId: string) => {
    const normalizedChatId = String(chatId || "").trim();
    if (!normalizedChatId) return false;
    const chat = state.chats.find(
      (item) => String(item?.chatId || "").trim() === normalizedChatId,
    );
    return (
      isChatActiveRun(chat) || hasStreamingSessionForChat(normalizedChatId)
    );
  };

  const isWorkerChatRunning = (chat: WorkerConversationRow) =>
    isChatActiveRun(chat) || hasStreamingSessionForChat(chat.chatId);

  const workerCollapseItems: CollapseProps["items"] = filteredWorkerRows.map(
    (row) => {
      const rawChats = workerChatsByKey.get(row.key) || [];
      const icon = workerIconsByKey.get(row.key);
      const unreadCount = workerUnreadCountByKey.get(row.key) || 0;
      const awaitingChat = rawChats.find((chat) => chat.hasPendingAwaiting);
      const activeRunChat = rawChats.find(isWorkerChatRunning);

      return {
        key: row.key,
        className: `worker-collapse-item ${row.key === state.workerSelectionKey ? "is-selected" : ""}`,
        showArrow: false,
        label: (
          <WorkerPanelHeader
            row={row}
            isActive={row.key === state.workerSelectionKey}
            icon={icon}
            lastChat={rawChats[0]}
            awaitingChat={awaitingChat}
            activeRunChat={activeRunChat}
            unreadCount={unreadCount}
            terminalActive={
              row.type === "agent" && activeTerminalAgents.has(row.sourceId)
            }
            onStartNewConversation={handleStartNewConversationForWorker}
            onMarkAllRead={handleMarkWorkerAllRead}
            onOpenWorkspace={handleOpenWorkspace}
            onRenameAgent={handleRenameAgent}
            onEditAgent={handleEditAgent}
            onDeleteAgent={handleDeleteAgent}
          />
        ),
        children: (
          <WorkerConversationPreviewList
            row={row}
            chats={rawChats}
            activeChatId={state.chatId}
            icon={icon}
            totalChatCount={workerTotalCountByKey.get(row.key)}
            getWorkerChatLoading={getWorkerChatLoading}
            onSelectChat={handleSelectChat}
            onOpenHistory={handleOpenHistory}
            onStartNewConversation={handleStartNewConversationForWorker}
            onMarkAllRead={handleMarkWorkerAllRead}
            onOpenWorkspace={handleOpenWorkspace}
            onRenameAgent={handleRenameAgent}
            onEditAgent={handleEditAgent}
            onDeleteAgent={handleDeleteAgent}
          />
        ),
      };
    },
  );

  const settingsSummaryBadges = useMemo(
    () =>
      resolveSettingsSummaryBadges({
        transportMode: state.transportMode,
        themeMode: state.themeMode,
        wsStatus: state.wsStatus,
        wsErrorMessage: state.wsErrorMessage,
      }),
    [
      state.themeMode,
      state.transportMode,
      state.wsErrorMessage,
      state.wsStatus,
    ],
  );

  // --- Create Project Dialog State ---
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [workspaceDir, setWorkspaceDir] = useState("");
  const [projectType, setProjectType] = useState<"coder" | "kbase">("coder");
  const [useAcp, setUseAcp] = useState(false);
  const [selectedAcpProxyId, setSelectedAcpProxyId] = useState("");
  const [projectNameTouched, setProjectNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleStartNewProject = () => {
    if (createModalOpen) return;

    setWorkspaceDir("");
    setProjectName("");
    setProjectType("coder");
    setUseAcp(false);
    setSelectedAcpProxyId(ACP_PROXY_OPTIONS[0]?.value || "");
    setProjectNameTouched(false);
    setCreateModalOpen(true);
  };

  const handleCloseModal = () => {
    setCreateModalOpen(false);
  };

  const handleSubmitCreate = async () => {
    const trimmedDir = workspaceDir.trim();
    if (!trimmedDir) {
      void message.warning(t("leftSidebar.createProject.directoryRequired"));
      return;
    }

    const trimmedName = projectName.trim();
    const name = trimmedName || workspaceNameFromPath(trimmedDir);

    if (projectType === "coder" && useAcp && !selectedAcpProxyId) {
      void message.warning(t("leftSidebar.createProject.acpRequired"));
      return;
    }

    setSubmitting(true);
    try {
      const definition =
        projectType === "kbase"
          ? buildKbaseAgentCreateRequest(trimmedDir, { name })
          : buildCoderAgentCreateRequest(trimmedDir, {
              name,
              acpProxyId: useAcp ? selectedAcpProxyId : undefined,
            });
      const response = await createAgent(definition);
      const createdKey = String(response.data?.key || "").trim();

      setCreateModalOpen(false);

      void handleCreateAgentSuccess(createdKey, dispatch, stateRef);
    } catch (error) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[new project error] ${(error as Error).message}`,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <aside
        className={`sidebar left-sidebar ${state.leftDrawerOpen ? "is-open" : ""}`}
        id="left-sidebar"
      >
        {state.leftDrawerOpen && (
          <>
            <Flex
              align="center"
              justify="space-between"
              gap={12}
              style={{ padding: "4px 12px 0" }}
            >
              <div className="brand-cluster">
                <div className="brand-mark">
                  <div className="brand-logo">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 400 400"
                      role="img"
                      aria-label="white cloud app icon with vibrant text"
                    >
                      <defs>
                        <linearGradient
                          id="brand-logo-blue-cyan-purple"
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="100%"
                          gradientUnits="userSpaceOnUse"
                        >
                          <stop offset="0%" stopColor="#EEF2FE" />
                          <stop offset="50%" stopColor="#00A2FF" />
                          <stop offset="100%" stopColor="#BB2BE2" />
                        </linearGradient>
                        <filter
                          id="brand-logo-cloud-shadow"
                          x="-20%"
                          y="-20%"
                          width="140%"
                          height="140%"
                        >
                          <feDropShadow
                            dx="0"
                            dy="8"
                            stdDeviation="12"
                            floodColor="#000000"
                            floodOpacity="0.08"
                          />
                        </filter>
                      </defs>
                      <path
                        d="M 344.889 238.823
                           A 90 90 0 0 1 238.798 344.982
                           A 90 90 0 0 1 93.909 306.159
                           A 90 90 0 0 1 55.111 161.177
                           A 90 90 0 0 1 161.202 55.018
                           A 90 90 0 0 1 306.091 93.841
                           A 90 90 0 0 1 344.889 238.823 Z"
                        fill="#FFFFFF"
                        filter="url(#brand-logo-cloud-shadow)"
                      />
                      <g
                        fill="url(#brand-logo-blue-cyan-purple)"
                        transform="translate(0, -20)"
                      >
                        <path d="M 120 135 Q 200 92 280 135 Q 200 132 120 135 Z" />
                        <path d="M 60 180 Q 200 102 340 180 Q 200 173 60 180 Z" />
                        <polygon points="231.5,190 278.5,190 168.5,290 121.5,290" />
                        <rect x="115" y="290" width="170" height="25" />
                      </g>
                    </svg>
                  </div>
                  <div className="brand-text">
                    <strong>AGENT</strong>
                    <span>Webclient</span>
                  </div>
                </div>
              </div>
              <Flex>
                <UiButton
                  id="top-nav-new-chat-btn"
                  className="icon-btn top-nav-new-chat-btn"
                  size="sm"
                  aria-label={t("topNav.newProject")}
                  title={t("topNav.newProject")}
                  variant="ghost"
                  iconOnly
                  disabled={createModalOpen}
                  onClick={handleStartNewProject}
                >
                  <MaterialIcon name="create_new_folder" />
                </UiButton>
                <UiButton
                  size="sm"
                  variant="ghost"
                  iconOnly
                  onClick={() =>
                    dispatch({
                      type: "SET_LEFT_DRAWER_OPEN",
                      open: false,
                    })
                  }
                >
                  <MaterialIcon name="dock_to_right" />
                </UiButton>
              </Flex>
            </Flex>
            {quickActionsEnabled && (
              <Flex className="left-sidebar-buttons">
                <UiButton
                  size="sm"
                  variant="ghost"
                  onClick={() => openCommandOverlay({ type: "automation" })}
                >
                  <MaterialIcon name="schedule" />
                  <Flex gap={2} align="center">
                    <span>{t("leftSidebar.quickActions.automation")}</span>
                    <Badge count={state.automations?.length} />
                  </Flex>
                </UiButton>
                {memoryEnabled && (
                  <UiButton
                    size="sm"
                    variant="ghost"
                    onClick={() => openOverlay("memoryInfo")}
                  >
                    <MaterialIcon name="psychology" />
                    <Flex gap={2} align="center">
                      <span>{t("leftSidebar.quickActions.memory")}</span>
                      <Badge count={state.memoryInfoRecords?.length || 0} />
                    </Flex>
                  </UiButton>
                )}
                <UiButton
                  size="sm"
                  variant="ghost"
                  onClick={() => openCommandOverlay({ type: "agents" })}
                >
                  <MaterialIcon name="robot_2" />
                  <Flex gap={2} align="center">
                    <span>{t("leftSidebar.quickActions.agents")}</span>
                    <Badge count={state.agents?.length || 0} />
                  </Flex>
                </UiButton>
              </Flex>
            )}
            <Flex gap={2} style={{ padding: "0 6px" }}>
              <Input
                variant="filled"
                placeholder={
                  state.conversationMode === "worker"
                    ? t("leftSidebar.filterWorkers")
                    : t("leftSidebar.filterChats")
                }
                value={navigation.chatFilter}
                prefix={
                  <MaterialIcon name="search" style={{ marginRight: 6 }} />
                }
                onChange={(e) =>
                  dispatch({
                    type: "SET_CHAT_FILTER",
                    filter: e.target.value,
                  })
                }
              />
              <UiButton
                size="sm"
                variant="ghost"
                loading={isSidebarLoading}
                iconOnly
                onClick={() => {
                  if (state.conversationMode === "worker") {
                    window.dispatchEvent(
                      new CustomEvent("agent:refresh-worker-data"),
                    );
                  } else {
                    window.dispatchEvent(
                      new CustomEvent("agent:refresh-chats"),
                    );
                  }
                }}
              >
                <MaterialIcon name="refresh" />
              </UiButton>
              <Dropdown
                menu={{
                  onClick: (info) => {
                    const nextSortMode = String(info.key || "");
                    if (
                      nextSortMode === "byName" ||
                      nextSortMode === "byTime"
                    ) {
                      setWorkerSortMode(nextSortMode);
                    }
                  },
                  selectedKeys: [workerSortMode],
                  items: [
                    {
                      key: "byName",
                      label: "按名称",
                    },
                    {
                      key: "byTime",
                      label: "按时间",
                    },
                  ],
                }}
              >
                <UiButton size="sm" variant="ghost" iconOnly>
                  <MaterialIcon name="list_arrow" />
                </UiButton>
              </Dropdown>
            </Flex>
          </>
        )}

        {state.conversationMode !== "worker" && (
          <div className="chat-meta">
            <span className="chat-meta-label">
              {t("leftSidebar.workerLabel")}
            </span>
            {state.chatId && state.chatAgentById.has(state.chatId) && (
              <UiTag className="chip" tone="accent">
                {state.chatAgentById.get(state.chatId)}
              </UiTag>
            )}
          </div>
        )}

        <div className="chat-list" id="chat-list">
          <Spin spinning={isSidebarLoading} tip={t("leftSidebar.loading")}>
            {state.conversationMode === "worker" ? (
              filteredWorkerRows.length === 0 ? (
                <div className="status-line">{t("leftSidebar.noWorkers")}</div>
              ) : state.leftDrawerOpen ? (
                <Collapse
                  accordion
                  ghost
                  className="worker-collapse"
                  activeKey={expandedWorkerKey || undefined}
                  items={workerCollapseItems}
                  onChange={handleWorkerCollapseChange}
                />
              ) : (
                <Flex vertical gap={10} align="center">
                  <UiButton
                    size="sm"
                    iconOnly
                    variant="ghost"
                    onClick={() =>
                      dispatch({
                        type: "SET_LEFT_DRAWER_OPEN",
                        open: true,
                      })
                    }
                  >
                    <MaterialIcon name="dock_to_right" />
                  </UiButton>
                  {filteredWorkerRows?.map((item) => {
                    const unreadCount =
                      workerUnreadCountByKey.get(item.key) || 0;
                    return (
                      <Popover
                        key={item.key}
                        trigger="hover"
                        placement="leftTop"
                        arrow={false}
                        classNames={{
                          root: "worker-popover",
                        }}
                        styles={{
                          body: {
                            padding: 0,
                            width: "var(--left-sidebar-width)",
                          },
                        }}
                        content={
                          <WorkerConversationPreviewList
                            row={item}
                            chats={workerChatsByKey.get(item.key) || []}
                            activeChatId={state.chatId}
                            icon={workerIconsByKey.get(item.key)}
                            showHeader
                            totalChatCount={workerTotalCountByKey.get(item.key)}
                            getWorkerChatLoading={getWorkerChatLoading}
                            onSelectChat={handleSelectChat}
                            onOpenHistory={handleOpenHistory}
                            onStartNewConversation={
                              handleStartNewConversationForWorker
                            }
                            onMarkAllRead={handleMarkWorkerAllRead}
                            onOpenWorkspace={handleOpenWorkspace}
                            onRenameAgent={handleRenameAgent}
                            onEditAgent={handleEditAgent}
                            onDeleteAgent={handleDeleteAgent}
                          />
                        }
                      >
                        <Button
                          type="text"
                          className={`worker-collapsed-icon ${item.key === state.workerSelectionKey ? "is-active" : ""}`}
                          onClick={() => handleSelectCollapsedWorker(item.key)}
                        >
                          <AgentIcon
                            icon={workerIconsByKey.get(item.key)}
                            type={item.type}
                            props={{
                              icon: {
                                className: "worker-panel-icon",
                                width: 26,
                                height: 26,
                              },
                              avatar: {
                                className: "worker-panel-icon",
                                size: 26,
                              },
                            }}
                          />
                          <Badge dot={unreadCount > 0} offset={[5, 9]}>
                            <span className="worker-collapsed-name">
                              {item.displayName}
                            </span>
                          </Badge>
                        </Button>
                      </Popover>
                    );
                  })}
                </Flex>
              )
            ) : filteredChats.length === 0 ? (
              <div className="status-line">
                {t("leftSidebar.noConversations")}
              </div>
            ) : (
              filteredChats.map((chat) => (
                <ChatItem
                  key={chat.chatId}
                  chat={chat}
                  agents={state.agents}
                  isActive={chat.chatId === state.chatId}
                  onClick={() => handleSelectChat(chat.chatId)}
                />
              ))
            )}
          </Spin>
        </div>
        {settingsMenuEnabled ? (
          <Popover
            open={settingsMenuOpen}
            trigger={state.leftDrawerOpen ? "click" : "hover"}
            placement="top"
            arrow={false}
            classNames={{
              root: "sidebar-settings-popover",
            }}
            onOpenChange={setSettingsMenuOpen}
            content={
              <SidebarSettingsMenu
                wsStatus={state.wsStatus}
                wsErrorMessage={state.wsErrorMessage}
                onAction={handleSettingsMenuAction}
              />
            }
          >
            <UiButton
              className="icon-btn"
              id="settings-btn"
              variant="ghost"
              aria-label={t("leftSidebar.openSettingsMenu")}
              aria-haspopup="menu"
              aria-expanded={settingsMenuOpen}
            >
              <MaterialIcon name="settings" />
              {state.leftDrawerOpen && (
                <>
                  <span>{t("leftSidebar.settings")}</span>
                  <span className="settings-trigger-summary">
                    {settingsSummaryBadges.map((badge) => (
                      <span
                        key={badge.key}
                        className="settings-summary-chip"
                        title={badge.title}
                      >
                        <MaterialIcon
                          name={badge.icon}
                          className="settings-summary-chip-icon"
                        />
                        <span>{badge.label}</span>
                      </span>
                    ))}
                  </span>
                </>
              )}
            </UiButton>
          </Popover>
        ) : null}
      </aside>

      <SidebarHistorySection
        open={Boolean(historyWorkerKey)}
        historyWorker={historyWorker}
        historyRows={remoteHistoryRows ?? filteredHistoryRows}
        historyIndex={historyIndex}
        historySearch={historySearch}
        historyInputRef={historyInputRef}
        historyListRef={historyListRef}
        historyItemRefs={historyItemRefs}
        onClose={handleCloseHistory}
        onHistorySearchChange={(value) => {
          setHistorySearch(value);
          setHistoryIndex(0);
          if (!value.trim()) {
            setRemoteHistoryRows(null);
          }
        }}
        onActivateIndex={setHistoryIndex}
        onSelectChat={handleSelectChat}
        onMarkAllRead={
          historyWorker?.type === "agent"
            ? (event) => handleMarkWorkerAllRead(event, historyWorker.key)
            : undefined
        }
        onChatDeleted={(chatId) => {
          setRemoteHistoryRows((rows) =>
            rows
              ? rows.filter((row) => String(row.chatId || "") !== chatId)
              : rows,
          );
        }}
      />

      <Modal
        title={t("leftSidebar.createProject.title")}
        open={createModalOpen}
        width="min(420px, calc(100vw - 32px))"
        centered
        onCancel={handleCloseModal}
        footer={[
          <Button key="cancel" onClick={handleCloseModal} disabled={submitting}>
            {t("leftSidebar.createProject.cancel")}
          </Button>,
          <Button
            key="create"
            type="primary"
            loading={submitting}
            onClick={handleSubmitCreate}
          >
            {submitting
              ? t("leftSidebar.createProject.creating")
              : t("leftSidebar.createProject.create")}
          </Button>,
        ]}
        destroyOnHidden
      >
        <Flex vertical gap={16} style={{ paddingTop: 8 }}>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: 4,
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              {t("leftSidebar.createProject.projectDirectory")}
            </label>
            <Input
              autoFocus
              value={workspaceDir}
              placeholder={t("leftSidebar.createProject.directoryPlaceholder")}
              disabled={submitting}
              onChange={(e) => {
                const value = e.target.value;
                setWorkspaceDir(value);
                if (!projectNameTouched) {
                  setProjectName(workspaceNameFromPath(value));
                }
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 4,
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              {t("leftSidebar.createProject.projectName")}
            </label>
            <Input
              value={projectName}
              placeholder={t(
                "leftSidebar.createProject.projectNamePlaceholder",
              )}
              disabled={submitting}
              onChange={(e) => {
                setProjectName(e.target.value);
                setProjectNameTouched(true);
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              {t("leftSidebar.createProject.projectType")}
            </label>
            <Radio.Group
              value={projectType}
              disabled={submitting}
              onChange={(e) => setProjectType(e.target.value)}
            >
              <Radio value="coder">CODER</Radio>
              <Radio value="kbase">KBASE</Radio>
            </Radio.Group>
          </div>

          {projectType === "coder" && (
            <>
              <Checkbox
                checked={useAcp}
                disabled={submitting}
                onChange={(e) => setUseAcp(e.target.checked)}
              >
                {t("leftSidebar.createProject.useAcp")}
              </Checkbox>

              {useAcp && (
                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 4,
                      fontWeight: 500,
                      fontSize: 13,
                    }}
                  >
                    {t("leftSidebar.createProject.acpProxy")}
                  </label>
                  <Select
                    value={selectedAcpProxyId || undefined}
                    disabled={submitting}
                    style={{ width: "100%" }}
                    options={ACP_PROXY_OPTIONS}
                    placeholder={t("leftSidebar.createProject.noAcpProxy")}
                    onChange={(value) => setSelectedAcpProxyId(value)}
                  />
                </div>
              )}
            </>
          )}
        </Flex>
      </Modal>
    </>
  );
};
