import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  Badge,
  Button,
  Collapse,
  CollapseProps,
  Flex,
  Input,
  message,
  Modal,
  Popover,
  Spin,
} from "antd";
import { useAppContext } from "@/app/state/AppContext";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import {
  dispatchSidebarSettingsAction,
  resolveSettingsSummaryBadges,
  SidebarSettingsMenu,
  type SidebarSettingsMenuAction,
} from "@/features/settings/components/SidebarSettingsMenu";
import {
  isQuickActionsEnabled,
  isSettingsMenuEnabled,
} from "@/shared/config/featureFlags";
import { useI18n } from "@/shared/i18n";
import { selectNavigationState } from "@/app/state/selectors";
import { AgentIcon } from "@/shared/icons/agent";
import { useLeftSidebarData } from "@/app/layout/hooks/useLeftSidebarData";
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
} from "@/features/transport/lib/apiClientProxy";
import { mergeFetchedChats } from "@/features/chats/lib/chatSummary";
import {
  isChatActiveRun,
  isWorkerAttentionChat,
} from "@/features/chats/lib/chatRunState";
import type { AppState, Chat, WorkerConversationRow } from "@/app/state/types";
import {
  openWorkspaceDirectory,
  selectProjectFolder,
} from "@/shared/api/desktopFileSystem";
import { buildWorkerRows } from "@/features/workers/lib/workerListFormatter";
import type { AgentDetailResponse } from "@/shared/api/apiClient";

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

function buildCoderAgentCreateRequest(workspaceDir: string) {
  return {
    definition: {
      name: workspaceNameFromPath(workspaceDir),
      mode: "CODER",
      icon: {
        name: "folder",
      },
      workspace: {
        root: workspaceDir,
      },
      runtimeConfig: {
        workspaceRoot: workspaceDir,
      },
      visibility: {
        scopes: ["nav", "copilot"],
      },
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeAgentMode(mode: unknown): string {
  const normalized = String(mode || "").trim().toUpperCase();
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
  const modelKey = String(meta.modelKey || detail.model || "").trim();
  if (modelKey) definition.modelConfig = { modelKey };
  if (Array.isArray(detail.tools)) definition.toolConfig = { tools: detail.tools };
  if (Array.isArray(detail.skills)) definition.skillConfig = { skills: detail.skills };
  if (Array.isArray(detail.wonders)) definition.wonders = detail.wonders;
  if (Array.isArray(detail.controls)) definition.controls = detail.controls;
  if (Array.isArray(visibility.scopes)) {
    definition.visibility = { scopes: visibility.scopes };
  }
  if (Object.keys(budget).length > 0) definition.budget = budget;
  return definition;
}

export const LeftSidebar: React.FC = () => {
  const { state, dispatch, querySessionsRef, stateRef } = useAppContext();
  const { t } = useI18n();
  const settingsMenuEnabled = isSettingsMenuEnabled();
  const quickActionsEnabled = isQuickActionsEnabled();
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
    workerRows: state.workerRows,
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
        detail: { workerKey, focusComposerOnComplete: true, preferNewChat: true },
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
      dispatch({ type: "SET_WORKER_SELECTION_KEY", workerKey: normalizedWorkerKey });
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
    const targetChat = runningChat || (
      isWorkerAttentionChat(latestChat) ? latestChat : undefined
    );
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
            ...(agentDetail.definition || buildFallbackAgentDefinition(agentDetail)),
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
    window.open(`/agents/${encodeURIComponent(agentKey)}${routeSearch}`, "_blank");
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
    const shouldClose = dispatchSidebarSettingsAction(action, dispatch);
    if (shouldClose) {
      setSettingsMenuOpen(false);
    }
  };

  const hasStreamingSessionForChat = (chatId: string) => {
    const normalizedChatId = String(chatId || "").trim();
    if (!normalizedChatId) return false;
    for (const session of querySessionsRef.current.values()) {
      if (session.streaming && String(session.chatId || "").trim() === normalizedChatId) {
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
    return isChatActiveRun(chat) || hasStreamingSessionForChat(normalizedChatId);
  };

  const isWorkerChatRunning = (chat: WorkerConversationRow) =>
    isChatActiveRun(chat) || hasStreamingSessionForChat(chat.chatId);

  const workerCollapseItems: CollapseProps["items"] = filteredWorkerRows.map(
    (row) => {
      const rawChats = workerChatsByKey.get(row.key) || [];
      const icon = workerIconsByKey.get(row.key);
      const unreadCount = workerUnreadCountByKey.get(row.key) || 0;
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
            activeRunChat={activeRunChat}
            unreadCount={unreadCount}
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
  const handleStartNewProject = () => {
    void selectProjectFolder()
      .then(async (selection) => {
        if (!selection) {
          dispatch({
            type: "APPEND_DEBUG",
            line: `[new project] ${t("leftSidebar.projectFolderSelectionCanceled")}`,
          });
          return;
        }

        dispatch({
          type: "APPEND_DEBUG",
          line: `[new project] ${t("leftSidebar.importingProject")}`,
        });
        const response = await createAgent(
          buildCoderAgentCreateRequest(selection.workspaceDir),
        );
        const createdKey = String(response.data?.key || "").trim();
        try {
          const agentsResponse = await getAgents({
            includeChats: 5,
            scope: "nav",
          });
          const agents = Array.isArray(agentsResponse.data)
            ? (agentsResponse.data as AppState["agents"])
            : [];
          dispatch({ type: "SET_AGENTS", agents });
          if (createdKey) {
            dispatch({
              type: "SET_WORKER_ROWS",
              rows: buildWorkerRows({
                agents,
                teams: stateRef.current.teams,
                chats: stateRef.current.chats,
                workerPriorityKey: `agent:${createdKey}`,
                allowUnknownAgentRows: false,
              }),
            });
          }
        } catch (error) {
          dispatch({
            type: "APPEND_DEBUG",
            line: `[loadAgents error] ${(error as Error).message}`,
          });
        }

        if (createdKey) {
          const workerKey = `agent:${createdKey}`;
          flushSync(() => {
            dispatch({ type: "SET_WORKER_SELECTION_KEY", workerKey });
            dispatch({ type: "SET_WORKER_RELATED_CHATS", chats: [] });
            dispatch({
              type: "SET_WORKER_CHAT_PANEL_COLLAPSED",
              collapsed: true,
            });
          });
        }
        window.dispatchEvent(new CustomEvent("agent:start-new-conversation"));
      })
      .catch((error) => {
        dispatch({
          type: "APPEND_DEBUG",
          line: `[new project error] ${(error as Error).message}`,
        });
      });
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
                  <div className="brand-logo">Z</div>
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
              <Flex className="left-sidebar-buttons" justify="space-between">
                <UiButton
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    dispatch({
                      type: "OPEN_COMMAND_MODAL",
                      modal: { type: "automation" },
                    });
                  }}
                >
                  <MaterialIcon name="schedule" />
                  <Flex gap={4} align="center">
                    <span>{t("leftSidebar.quickActions.automation")}</span>
                    <Badge count={state.automations?.length} />
                  </Flex>
                </UiButton>
                <UiButton
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    dispatch({ type: "SET_MEMORY_INFO_OPEN", open: true })
                  }
                >
                  <MaterialIcon name="psychology" />
                  <Flex gap={4} align="center">
                    <span>{t("leftSidebar.quickActions.memory")}</span>
                    <Badge count={state.memoryInfoRecords?.length || 0} />
                  </Flex>
                </UiButton>
                <UiButton
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    dispatch({
                      type: "OPEN_COMMAND_MODAL",
                      modal: { type: "agents" },
                    });
                  }}
                >
                  <MaterialIcon name="robot_2" />
                  <Flex gap={4} align="center">
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
    </>
  );
};
