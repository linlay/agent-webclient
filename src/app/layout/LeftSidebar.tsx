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
import { CopyInfoModal } from "@/shared/ui/CopyInfoModal";
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
import { ChatItem } from "@/features/chats/components/ChatItem";
import { WorkerPanelHeader } from "@/app/layout/sidebar/WorkerPanelHeader";
import { WorkerConversationPreviewList } from "@/app/layout/sidebar/WorkerConversationPreviewList";
import { SidebarHistorySection } from "@/app/layout/sidebar/SidebarHistorySection";
import {
  createAgent,
  deleteAgent,
  getAgent,
  getAgents,
  getChats,
  markChatRead,
  searchGlobal,
  updateAgentName,
} from "@/shared/data";
import { mergeFetchedChats } from "@/features/chats/lib/chatSummary";
import {
  isChatActiveRun,
  isWorkerAttentionChat,
} from "@/features/chats/lib/chatRunState";
import { resolveSidebarChatRuntime } from "@/features/runs/lib/runRuntimeState";
import type { AppState, Chat, WorkerConversationRow, WorkerListItem } from "@/app/state/types";
import { openRegisteredAgentDirectory } from "@/shared/data/desktop/desktopFileSystem";
import { canOpenWorkerWorkspace } from "@/features/workers/lib/workerWorkspace";
import { buildWorkerRows } from "@/features/workers/lib/workerListFormatter";
import { splitWorkerListItems } from "@/features/workers/lib/workerDataCoordinator";
import { useTerminalAgentStatuses } from "@/features/terminal/hooks/useActiveTerminalAgents";
import { readEpochMillis } from "@/shared/utils/platformTime";
import {
  buildAgentCopyInfoGroups,
  type AgentCopySummary,
} from "@/features/workers/lib/agentCopyInfo";
import type { AgentDetailResponse } from "@/shared/data";

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
  options: { name?: string; acpBridgeId?: string } = {},
) {
  const name = String(options.name || "").trim();
  const runtimeConfig: Record<string, unknown> = {
    workspaceRoot: workspaceDir,
  };
  if (options.acpBridgeId) {
    runtimeConfig.acpBridgeId = options.acpBridgeId;
  }
  return {
    definition: {
      ...(name ? { name } : {}),
      mode: "CODER",
      runtimeConfig,
    },
  };
}

export function buildKbaseAgentCreateRequest(
  workspaceDir: string,
  options: { name?: string } = {},
) {
  const name = String(options.name || "").trim();
  return {
    definition: {
      ...(name ? { name } : {}),
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

const LEFT_SIDEBAR_BASE_CLASS =
  "sidebar left-sidebar is-open tw:!relative tw:gap-1.5 tw:px-0 tw:py-1.5";

const LEFT_SIDEBAR_WIDTH_CLASS = {
  open: "tw:w-[var(--left-sidebar-width)]",
  closed: "tw:w-[var(--left-sidebar-close-width)]",
} as const;

const LEFT_SIDEBAR_TOP_ROW_CLASS =
  "tw:flex tw:items-center tw:justify-between tw:gap-3 tw:px-3 tw:pb-0 tw:pt-1";

const LEFT_SIDEBAR_BUTTONS_CLASS =
  "left-sidebar-buttons tw:px-1.5 tw:[&_.ant-badge_.ant-badge-count]:bg-accent-soft tw:[&_.ant-badge_.ant-badge-count]:text-[10px] tw:[&_.ant-badge_.ant-badge-count]:text-accent tw:[&_.ui-btn-label]:gap-1 tw:[&_.ui-btn.ui-btn-sm]:min-w-0 tw:[&_.ui-btn.ui-btn-sm]:flex-1 tw:[&_.ui-btn.ui-btn-sm]:px-0.5";

const LEFT_SIDEBAR_FILTER_ROW_CLASS = "tw:px-1.5";

const SIDEBAR_STATIC_ICON_CLASS = "sidebar-static-icon";

const CHAT_META_CLASS =
  "chat-meta tw:flex tw:items-center tw:gap-1.5 tw:px-4 tw:pb-2 tw:pt-0";

const CHAT_META_LABEL_CLASS =
  "chat-meta-label tw:text-[10px] tw:font-semibold tw:uppercase tw:tracking-[0.06em] tw:text-ink-muted";

const CHAT_META_CHIP_CLASS =
  "chip tw:!px-2 tw:!py-[3px] tw:font-code tw:!text-[10px] tw:font-medium tw:leading-none";

const CHAT_LIST_CLASS =
  "chat-list tw:flex-1 tw:overflow-y-auto tw:p-1.5 tw:[-ms-overflow-style:none] tw:[scrollbar-width:none] tw:[&::-webkit-scrollbar]:hidden";

const WORKER_COLLAPSE_CLASS =
  "worker-collapse tw:flex tw:flex-col tw:gap-1.5 tw:[&_.ant-collapse-item-active_.worker-panel-icon]:scale-[0.8] tw:[&_.ant-collapse-item-active_.worker-panel-preview]:h-0 tw:[&_.ant-collapse-item-active>.ant-collapse-header_.ant-badge]:hidden tw:[&_.status-line]:border-0 tw:[&_.status-line]:bg-transparent tw:[&_.worker-collapse-history]:text-text-muted";

const WORKER_COLLAPSED_ICON_BASE_CLASS =
  "worker-collapsed-icon tw:flex tw:h-auto tw:w-full tw:flex-col tw:items-center tw:justify-center tw:gap-0.5 tw:border-0 tw:bg-transparent tw:!p-0.5 tw:text-ink-2 tw:shadow-none tw:hover:!bg-accent-soft";

const WORKER_COLLAPSED_ICON_STATE_CLASS = {
  active: "is-active tw:bg-accent-soft tw:!text-accent",
  idle: "",
} as const;

const WORKER_COLLAPSED_NAME_BADGE_CLASS =
  "worker-collapsed-name-badge tw:min-w-0 tw:max-w-[48px] tw:text-center";

const WORKER_COLLAPSED_NAME_CLASS =
  "worker-collapsed-name tw:inline-block tw:max-w-full tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-left tw:align-top tw:text-[10px] tw:leading-[1.2]";
export async function handleCreateAgentSuccess(
  createdKey: string,
  dispatch: React.Dispatch<AppAction>,
  stateRef: React.MutableRefObject<AppState>,
) {
  if (!createdKey) return;

  const agentsResponse = await getAgents({
    includeChats: 5,
    includeTeam: true,
    scope: "nav",
  });
  const workers = splitWorkerListItems(
    Array.isArray(agentsResponse.data)
      ? (agentsResponse.data as WorkerListItem[])
      : [],
  );
  const chats = mergeFetchedChats(stateRef.current.chats, workers.chats);
  dispatch({ type: "SET_AGENTS", agents: workers.agents });
  dispatch({ type: "SET_TEAMS", teams: workers.teams });
  dispatch({ type: "SET_WORKER_ORDER_KEYS", workerOrderKeys: workers.workerOrderKeys });
  dispatch({ type: "SET_CHATS", chats });

  const rows = buildWorkerRows({
    agents: workers.agents,
    teams: workers.teams,
    chats,
    workerOrderKeys: workers.workerOrderKeys,
    workerPriorityKey: `agent:${createdKey}`,
  });
  dispatch({ type: "SET_WORKER_ROWS", rows });

  dispatch({
    type: "SET_TEMPORARY_PINNED_AGENT_KEY",
    agentKey: createdKey,
  });

  const workerKey = `agent:${createdKey}`;
  dispatch({ type: "SET_CONVERSATION_MODE", mode: "worker" });
  dispatch({ type: "SET_WORKER_SELECTION_KEY", workerKey });
  dispatch({ type: "SET_WORKER_RELATED_CHATS", chats: [] });
  dispatch({ type: "SET_WORKER_CHAT_PANEL_COLLAPSED", collapsed: true });
}

export const LeftSidebar: React.FC = () => {
  const { state, dispatch, querySessionsRef, stateRef } = useAppContext();
  const { t } = useI18n();
  const terminalAgentStatuses = useTerminalAgentStatuses();
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
  const [agentCopyTarget, setAgentCopyTarget] = useState<AgentCopySummary | null>(null);
  const [agentCopyDetail, setAgentCopyDetail] = useState<AgentDetailResponse | null>(null);
  const [agentCopyLoading, setAgentCopyLoading] = useState(false);
  const [agentCopyError, setAgentCopyError] = useState("");
  const agentCopyRequestRef = useRef(0);
  useEffect(() => () => {
    agentCopyRequestRef.current += 1;
  }, []);
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
                chatName: String(result.chatName || ""),
                agentKey: result.agentKey,
                teamId: result.teamId,
                updatedAt: readEpochMillis(result.timestamp) ?? 0,
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
      setRemoteHistoryRows(null);
      setHistoryIndex(currentChatIndex >= 0 ? currentChatIndex : 0);

      const worker =
        state.workerIndexByKey.get(normalizedWorkerKey) ||
        state.workerRows.find((item) => item.key === normalizedWorkerKey);
      if (!worker) return;

      void getChats(worker.type === "agent" ? { agentKey: worker.sourceId } : undefined)
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

  const handleHistoryWorkerChange = (workerKey: string) => {
    const normalizedWorkerKey = String(workerKey || "").trim();
    if (!normalizedWorkerKey || normalizedWorkerKey === historyWorkerKey) return;
    openHistoryForWorker(normalizedWorkerKey);
    setHistoryIndex(0);
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
    if (!canOpenWorkerWorkspace(row)) {
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
    void openRegisteredAgentDirectory({
      agentKey,
      directoryType: "workspace",
      ...(workspaceDir ? { desktopPath: workspaceDir } : {}),
    })
      .then((opened) => {
        if (!opened) {
          dispatch({
            type: "APPEND_DEBUG",
            line: `[workspace] ${t("leftSidebar.workspaceUnavailable")}${workspaceDir ? `: ${workspaceDir}` : ""}`,
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

  const handleOpenConfigDirectory = (workerKey: string) => {
    const row =
      state.workerIndexByKey.get(workerKey) ||
      state.workerRows.find((item) => item.key === workerKey);
    const agentConfigDir = String(row?.agentConfigDir || "").trim();
    const agentKey = String(row?.sourceId || "").trim();
    if (!agentConfigDir || !agentKey) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[config directory] ${t("leftSidebar.configDirectoryUnavailable")}`,
      });
      return;
    }
    void openRegisteredAgentDirectory({
      agentKey,
      directoryType: "config",
      desktopPath: agentConfigDir,
    })
      .then((opened) => {
        if (!opened) {
          dispatch({
            type: "APPEND_DEBUG",
            line: `[config directory] ${t("leftSidebar.configDirectoryUnavailable")}: ${agentConfigDir}`,
          });
        }
      })
      .catch((error) => {
        dispatch({
          type: "APPEND_DEBUG",
          line: `[config directory open error] ${(error as Error).message}`,
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
          await updateAgentName({ key: agentKey, name: newName });
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

  const loadAgentCopyDetail = (target: AgentCopySummary) => {
    const requestId = agentCopyRequestRef.current + 1;
    agentCopyRequestRef.current = requestId;
    setAgentCopyLoading(true);
    setAgentCopyError("");
    setAgentCopyDetail(null);
    void getAgent(target.agentKey)
      .then((response) => {
        if (agentCopyRequestRef.current !== requestId) return;
        setAgentCopyDetail(response.data);
      })
      .catch((error) => {
        if (agentCopyRequestRef.current !== requestId) return;
        const errorMessage = error instanceof Error ? error.message : String(error);
        setAgentCopyError(errorMessage);
        dispatch({
          type: "APPEND_DEBUG",
          line: `[load agent copy detail error] ${errorMessage}`,
        });
      })
      .finally(() => {
        if (agentCopyRequestRef.current === requestId) {
          setAgentCopyLoading(false);
        }
      });
  };

  const handleCopyAgent = (workerKey: string, agentKey: string) => {
    const row =
      state.workerIndexByKey.get(workerKey) ||
      state.workerRows.find((item) => item.key === workerKey);
    const target: AgentCopySummary = {
      agentKey: String(agentKey || row?.sourceId || "").trim(),
      name: String(row?.displayName || agentKey || "").trim(),
      type: row?.agentType,
      role: row?.role,
      workspaceDir: row?.workspaceDir,
      workspaceName: row?.workspaceName,
    };
    if (!target.agentKey) return;
    setAgentCopyTarget(target);
    loadAgentCopyDetail(target);
  };

  const handleCloseAgentCopy = () => {
    agentCopyRequestRef.current += 1;
    setAgentCopyTarget(null);
    setAgentCopyDetail(null);
    setAgentCopyLoading(false);
    setAgentCopyError("");
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
    const openStandalonePage = (path: string) => {
      window.open(
        `${path}${window.location.search || ""}`,
        "_blank",
        "noopener,noreferrer",
      );
      setSettingsMenuOpen(false);
    };
    if (action.type === "open-skills") {
      openStandalonePage("/skills");
      return;
    }
    if (action.type === "open-registries") {
      openStandalonePage("/registries");
      return;
    }
    if (action.type === "open-mcp-servers") {
      openStandalonePage("/mcp-servers");
      return;
    }
    if (action.type === "open-archive") {
      openStandalonePage("/archives");
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

  const getWorkerChatLoading = (chatId: string) => {
    const normalizedChatId = String(chatId || "").trim();
    if (!normalizedChatId) return false;
    return resolveSidebarChatRuntime(
      normalizedChatId,
      state.chats,
      querySessionsRef,
    ).running;
  };

  const isWorkerChatRunning = (chat: WorkerConversationRow) =>
    resolveSidebarChatRuntime(
      chat.chatId,
      state.chats,
      querySessionsRef,
    ).running || isChatActiveRun(chat);

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
            terminalStatus={
              row.type === "agent"
                ? terminalAgentStatuses.get(row.sourceId)
                : undefined
            }
            onStartNewConversation={handleStartNewConversationForWorker}
            onMarkAllRead={handleMarkWorkerAllRead}
            onOpenWorkspace={handleOpenWorkspace}
            onOpenConfigDirectory={handleOpenConfigDirectory}
            onRenameAgent={handleRenameAgent}
            onEditAgent={handleEditAgent}
            onCopyAgent={handleCopyAgent}
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
            onOpenConfigDirectory={handleOpenConfigDirectory}
            onRenameAgent={handleRenameAgent}
            onEditAgent={handleEditAgent}
            onCopyAgent={handleCopyAgent}
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
  const [selectedAcpBridgeId, setSelectedAcpBridgeId] = useState("");
  const [projectNameTouched, setProjectNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleStartNewProject = () => {
    if (createModalOpen) return;

    setWorkspaceDir("");
    setProjectName("");
    setProjectType("coder");
    setUseAcp(false);
    setSelectedAcpBridgeId(ACP_PROXY_OPTIONS[0]?.value || "");
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

    if (projectType === "coder" && useAcp && !selectedAcpBridgeId) {
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
              acpBridgeId: useAcp ? selectedAcpBridgeId : undefined,
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
        className={`${LEFT_SIDEBAR_BASE_CLASS} ${
          state.leftDrawerOpen
            ? LEFT_SIDEBAR_WIDTH_CLASS.open
            : LEFT_SIDEBAR_WIDTH_CLASS.closed
        }`}
        id="left-sidebar"
      >
        {state.leftDrawerOpen && (
          <>
            <Flex
              align="center"
              justify="space-between"
              gap={12}
              className={LEFT_SIDEBAR_TOP_ROW_CLASS}
            >
              <div className="brand-text">
                <strong>AGENT</strong>
                <span>Webclient</span>
              </div>
              <Flex gap={4}>
                <UiButton
                  id="top-nav-new-chat-btn"
                  className="icon-btn top-nav-new-chat-btn ui-icon-hover-24"
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
                  className="ui-icon-hover-24"
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
              <Flex className={LEFT_SIDEBAR_BUTTONS_CLASS}>
                <UiButton
                  size="sm"
                  variant="ghost"
                  className="ui-icon-hover-24"
                  onClick={() => openCommandOverlay({ type: "automation" })}
                >
                  <MaterialIcon
                    name="schedule"
                    className="ui-icon-hover-24-target"
                  />
                  <Flex gap={2} align="center">
                    <span>{t("leftSidebar.quickActions.automation")}</span>
                    <Badge count={state.automations?.length} />
                  </Flex>
                </UiButton>
                {memoryEnabled && (
                  <UiButton
                    size="sm"
                    variant="ghost"
                    className="ui-icon-hover-24"
                    onClick={() => openOverlay("memoryInfo")}
                  >
                    <MaterialIcon
                      name="psychology"
                      className="ui-icon-hover-24-target"
                    />
                    <Flex gap={2} align="center">
                      <span>{t("leftSidebar.quickActions.memory")}</span>
                      <Badge count={state.memoryInfoRecords?.length || 0} />
                    </Flex>
                  </UiButton>
                )}
                <UiButton
                  size="sm"
                  variant="ghost"
                  className="ui-icon-hover-24"
                  onClick={() => openCommandOverlay({ type: "agents" })}
                >
                  <MaterialIcon
                    name="smart_toy"
                    className="ui-icon-hover-24-target"
                  />
                  <Flex gap={2} align="center">
                    <span>{t("leftSidebar.quickActions.agents")}</span>
                    <Badge count={state.agents?.length || 0} />
                  </Flex>
                </UiButton>
              </Flex>
            )}
            <Flex gap={2} className={LEFT_SIDEBAR_FILTER_ROW_CLASS}>
              <Input
                variant="filled"
                placeholder={
                  state.conversationMode === "worker"
                    ? t("leftSidebar.filterWorkers")
                    : t("leftSidebar.filterChats")
                }
                value={navigation.chatFilter}
                prefix={
                  <MaterialIcon
                    name="search"
                    className={SIDEBAR_STATIC_ICON_CLASS}
                    style={{ marginRight: 6 }}
                  />
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
                className="ui-icon-hover-24"
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
                      label: t("leftSidebar.sort.byName"),
                    },
                    {
                      key: "byTime",
                      label: t("leftSidebar.sort.byTime"),
                    },
                  ],
                }}
              >
                <UiButton
                  size="sm"
                  variant="ghost"
                  iconOnly
                  className="ui-icon-hover-24"
                >
                  <MaterialIcon name="list_arrow" />
                </UiButton>
              </Dropdown>
            </Flex>
          </>
        )}

        {state.conversationMode !== "worker" && (
          <div className={CHAT_META_CLASS}>
            <span className={CHAT_META_LABEL_CLASS}>
              {t("leftSidebar.workerLabel")}
            </span>
            {state.chatId && state.chatAgentById.has(state.chatId) && (
              <UiTag className={CHAT_META_CHIP_CLASS} tone="accent">
                {state.chatAgentById.get(state.chatId)}
              </UiTag>
            )}
          </div>
        )}

        <div className={CHAT_LIST_CLASS} id="chat-list">
          <Spin spinning={isSidebarLoading} tip={t("leftSidebar.loading")}>
            {state.conversationMode === "worker" ? (
              filteredWorkerRows.length === 0 ? (
                <div className="status-line">{t("leftSidebar.noWorkers")}</div>
              ) : state.leftDrawerOpen ? (
                <Collapse
                  accordion
                  ghost
                  className={WORKER_COLLAPSE_CLASS}
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
                    className="ui-icon-hover-24"
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
                            onOpenConfigDirectory={handleOpenConfigDirectory}
                            onRenameAgent={handleRenameAgent}
                            onEditAgent={handleEditAgent}
                            onCopyAgent={handleCopyAgent}
                            onDeleteAgent={handleDeleteAgent}
                          />
                        }
                      >
                        <Button
                          type="text"
                          className={`${WORKER_COLLAPSED_ICON_BASE_CLASS} ${
                            item.key === state.workerSelectionKey
                              ? WORKER_COLLAPSED_ICON_STATE_CLASS.active
                              : WORKER_COLLAPSED_ICON_STATE_CLASS.idle
                          }`}
                          aria-label={item.displayName}
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
                          <Badge
                            dot={unreadCount > 0}
                            offset={[5, 9]}
                            className={WORKER_COLLAPSED_NAME_BADGE_CLASS}
                          >
                            <span className={WORKER_COLLAPSED_NAME_CLASS}>
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
              className="icon-btn ui-icon-hover-24"
              id="settings-btn"
              variant="ghost"
              aria-label={t("leftSidebar.openSettingsMenu")}
              aria-haspopup="menu"
              aria-expanded={settingsMenuOpen}
            >
              <MaterialIcon
                name="settings"
                className="ui-icon-hover-24-target"
              />
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

      <CopyInfoModal
        open={Boolean(agentCopyTarget)}
        title={t("agentCopy.title")}
        groups={agentCopyTarget
          ? buildAgentCopyInfoGroups({
              summary: agentCopyTarget,
              detail: agentCopyDetail,
              t,
            })
          : []}
        rawData={agentCopyDetail}
        rawReady={Boolean(agentCopyDetail)}
        loading={agentCopyLoading}
        error={agentCopyError}
        onRetry={agentCopyTarget
          ? () => loadAgentCopyDetail(agentCopyTarget)
          : undefined}
        onClose={handleCloseAgentCopy}
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
                    value={selectedAcpBridgeId || undefined}
                    disabled={submitting}
                    style={{ width: "100%" }}
                    options={ACP_PROXY_OPTIONS}
                    placeholder={t("leftSidebar.createProject.noAcpProxy")}
                    onChange={(value) => setSelectedAcpBridgeId(value)}
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
