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
  Dropdown,
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
import { CopyInfoModal } from "@/shared/ui/CopyInfoModal";
import {
  isQuickActionsEnabled,
  isSettingsMenuEnabled,
  isMemoryEnabled,
} from "@/shared/config/featureFlags";
import { useI18n } from "@/shared/i18n";
import { selectNavigationState } from "@/app/state/selectors";
import { AgentIcon } from "@/shared/icons/agent";
import { useWorkerSidebarData } from "@/features/workers/hooks/useWorkerSidebarData";
import type { WorkerSortMode } from "@/features/workers/hooks/useWorkerSidebarData";
import type { WorkerActionHandlers } from "./WorkerActionsMenu";
import { WorkerPanelHeader } from "@/features/workers/components/WorkerPanelHeader";
import { WorkerConversationPreviewList } from "@/features/workers/components/WorkerConversationPreviewList";
import { SidebarHistorySection } from "@/features/chats/components/SidebarHistorySection";
import { markChatRead } from "@/shared/data";
import {
  isChatActiveRun,
  isWorkerAttentionChat,
} from "@/features/chats/lib/chatRunState";
import { resolveSidebarChatRuntime } from "@/features/runs/lib/runRuntimeState";
import type { WorkerConversationRow } from "@/features/workers/lib/workerState";
import { openWorkerDirectory } from "@/features/workers/lib/workerWorkspace";
import { useTerminalAgentStatuses } from "@/features/terminal/hooks/useActiveTerminalAgents";
import {
  buildAgentCopyInfoGroups,
  type AgentCopySummary,
} from "@/features/workers/lib/agentCopyInfo";
import type { AgentDetailResponse } from "@/shared/data";
import { AgentProjectCreateDialog } from "@/features/agents/components/AgentProjectCreateDialog";
import { useAgentProjectCreate } from "@/features/agents/hooks/useAgentProjectCreate";
import { handleCreateAgentSuccess } from "@/features/workers/lib/agentProjectCreated";
import {
  deleteManagedAgent,
  loadAgentCopyDetail as requestAgentCopyDetail,
  renameManagedAgent,
} from "@/features/agents/lib/agentOperations";
import "./WorkerNavigator.module.css";

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
interface WorkerNavigatorProps {
  onOpenCommand: (type: "automation" | "agents") => void;
  onOpenMemory: () => void;
  renderSettingsMenu: (close: () => void) => React.ReactNode;
  settingsSummary?: React.ReactNode;
}

export const WorkerNavigator: React.FC<WorkerNavigatorProps> = ({
  onOpenCommand,
  onOpenMemory,
  renderSettingsMenu,
  settingsSummary,
}) => {
  const { state, stateRef, dispatch, querySessionsRef } = useAppContext();
  const { t } = useI18n();
  const terminalAgentStatuses = useTerminalAgentStatuses();
  const settingsMenuEnabled = isSettingsMenuEnabled();
  const quickActionsEnabled = isQuickActionsEnabled();
  const memoryEnabled = isMemoryEnabled();
  const navigation = selectNavigationState(state);
  const isSidebarLoading = navigation.sidebarPendingRequestCount > 0;
  const [expandedWorkerKey, setExpandedWorkerKey] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
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
  const {
    filteredWorkerRows,
    workerIconsByKey,
    workerChatsByKey,
    workerUnreadCountByKey,
    workerTotalCountByKey,
  } = useWorkerSidebarData({
    agents: state.agents,
    chatFilter: state.chatFilter,
    chats: state.chats,
    teams: state.teams,
    temporaryPinnedAgentKey: state.temporaryPinnedAgentKey,
    workerRows: state.workerRows,
    workerSortMode,
  });

  useEffect(() => {
    setExpandedWorkerKey(state.workerSelectionKey);
  }, [state.workerSelectionKey]);

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

  const openHistory = useCallback(() => {
    setHistoryOpen(true);
  }, []);

  const handleOpenHistory = (event: React.MouseEvent<Element>) => {
    event.stopPropagation();
    openHistory();
  };

  useEffect(() => {
    const handler = () => {
      openHistory();
    };
    window.addEventListener("agent:open-worker-history", handler);
    return () =>
      window.removeEventListener("agent:open-worker-history", handler);
  }, [openHistory]);

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

  const handleOpenDirectory = (workerKey: string, directoryType: "workspace" | "config") => {
    const row =
      state.workerIndexByKey.get(workerKey) ||
      state.workerRows.find((item) => item.key === workerKey);
    void openWorkerDirectory(row, directoryType, t, (line) => {
      dispatch({ type: "APPEND_DEBUG", line });
    });
  };

  const handleOpenWorkspace = (workerKey: string) =>
    handleOpenDirectory(workerKey, "workspace");

  const handleOpenConfigDirectory = (workerKey: string) =>
    handleOpenDirectory(workerKey, "config");

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
          await renameManagedAgent(agentKey, newName);
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
    void requestAgentCopyDetail(target.agentKey)
      .then((detail) => {
        if (agentCopyRequestRef.current !== requestId) return;
        setAgentCopyDetail(detail);
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
          await deleteManagedAgent(agentKey);
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

  const workerActions: WorkerActionHandlers = {
    onOpenWorkspace: handleOpenWorkspace,
    onOpenConfigDirectory: handleOpenConfigDirectory,
    onRenameAgent: handleRenameAgent,
    onEditAgent: handleEditAgent,
    onCopyAgent: handleCopyAgent,
    onDeleteAgent: handleDeleteAgent,
  };

  const handleCloseHistory = () => {
    setHistoryOpen(false);
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
            {...workerActions}
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
            {...workerActions}
          />
        ),
      };
    },
  );

  const agentProjectCreate = useAgentProjectCreate({
    onCreated: (agentKey) => handleCreateAgentSuccess(agentKey, dispatch, stateRef),
    onError: (error) => dispatch({
      type: "APPEND_DEBUG",
      line: `[new project error] ${(error as Error).message}`,
    }),
  });

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
                  disabled={agentProjectCreate.open}
                  onClick={agentProjectCreate.begin}
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
                  onClick={() => onOpenCommand("automation")}
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
                    onClick={onOpenMemory}
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
                  onClick={() => onOpenCommand("agents")}
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
                placeholder={t("leftSidebar.filterWorkers")}
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
                  window.dispatchEvent(
                    new CustomEvent("agent:refresh-worker-data"),
                  );
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

        <div className={CHAT_LIST_CLASS} id="chat-list">
          <Spin spinning={isSidebarLoading} tip={t("leftSidebar.loading")}>
            {filteredWorkerRows.length === 0 ? (
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
                            {...workerActions}
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
            content={renderSettingsMenu(() => setSettingsMenuOpen(false))}
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
                  {settingsSummary}
                </>
              )}
            </UiButton>
          </Popover>
        ) : null}
      </aside>

      <SidebarHistorySection
        open={historyOpen}
        onClose={handleCloseHistory}
        onSelectChat={handleSelectChat}
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

      <AgentProjectCreateDialog runtime={agentProjectCreate} />
    </>
  );
};
