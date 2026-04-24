import React, { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Badge,
  Button,
  Collapse,
  CollapseProps,
  Flex,
  Input,
  Modal,
  Popover,
  Spin,
  Tooltip,
  Typography,
} from "antd";
import { useAppContext } from "@/app/state/AppContext";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { HistoryModal } from "@/app/modals/HistoryModal";
import { UiButton } from "@/shared/ui/UiButton";
import { UiInput } from "@/shared/ui/UiInput";
import { UiListItem } from "@/shared/ui/UiListItem";
import { UiTag } from "@/shared/ui/UiTag";
import {
  dispatchSidebarSettingsAction,
  resolveSettingsSummaryBadges,
  SidebarSettingsMenu,
  type SidebarSettingsMenuAction,
} from "@/features/settings/components/SidebarSettingsMenu";
import {
  formatChatTimeLabel,
  pickChatAgentLabel,
} from "@/features/chats/lib/chatListFormatter";
import {
  isChatUnread,
  resolveWorkerUnreadCount,
} from "@/features/chats/lib/chatReadState";
import { buildWorkerConversationRows } from "@/features/workers/lib/workerConversationFormatter";
import { createWorkerKeyFromChat } from "@/features/workers/lib/workerListFormatter";
import type { Chat, WorkerConversationRow, WorkerRow } from "@/app/state/types";
import { AgentIcon } from "@/shared/icons/agent";
import { SearchOutlined } from "@ant-design/icons";

type AgentIconConfig = {
  color?: string;
  name?: string;
};

const UnreadDot: React.FC<{ chat: Chat | WorkerConversationRow }> = ({
  chat,
}) => {
  const isUnread = isChatUnread(chat);
  return (
    <span
      className={["chat-unread-dot", isUnread ? "is-unread" : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label="未读"
    />
  );
};

const ChatItem: React.FC<{
  chat: Chat;
  agents: Array<{ key?: string; name?: string }>;
  isActive: boolean;
  onClick: () => void;
}> = ({ chat, agents, isActive, onClick }) => {
  const label = pickChatAgentLabel(chat, agents);
  const title = chat.chatName || chat.chatId || "(无标题)";
  const isUnread = isChatUnread(chat);

  return (
    <UiListItem
      className={`chat-item ${isActive ? "is-active" : ""} ${isUnread ? "is-unread" : ""}`}
      selected={isActive}
      dense
      onClick={onClick}
    >
      <div className="chat-item-head">
        <div className="chat-title-wrap">
          <UnreadDot chat={chat} />
          <div className="chat-title">{title}</div>
        </div>
        <span className="worker-panel-time-label">
          {formatChatTimeLabel(chat.updatedAt)}
        </span>
      </div>
      <div className="chat-meta-line">
        <UiTag tone="muted">{label}</UiTag>
      </div>
    </UiListItem>
  );
};

const WorkerChatPreviewItem: React.FC<{
  chat: WorkerConversationRow;
  isActive: boolean;
  loading: boolean;
  onClick: () => void;
}> = ({ chat, isActive, loading, onClick }) => {
  return (
    <UiListItem
      className={`worker-chat-item ${isActive ? "is-active" : ""}`}
      selected={isActive}
      loading={loading}
      onClick={onClick}
    >
      <div className="worker-chat-item-head">
        <UnreadDot chat={chat} />
        <span className="worker-chat-name">
          {chat.lastRunContent || chat.chatName || "(无预览)"}
        </span>
        {chat.hasPendingAwaiting && (
          <span className="chat-awaiting-status">等待批准</span>
        )}
        <span className="worker-panel-time-label">
          {formatChatTimeLabel(chat.updatedAt)}
        </span>
      </div>
    </UiListItem>
  );
};

const WorkerPanelHeader: React.FC<{
  row: WorkerRow;
  isActive: boolean;
  icon?: AgentIconConfig;
  lastChat?: WorkerConversationRow;
  unreadCount?: number;
  onStartNewConversation: (
    e: React.MouseEvent<HTMLElement>,
    workerKey: string,
  ) => void;
}> = ({
  row,
  isActive,
  icon,
  lastChat,
  unreadCount = 0,
  onStartNewConversation,
}) => {
  const preview = lastChat
    ? lastChat?.lastRunContent || lastChat?.chatName || "最新对话无答复"
    : "暂无历史对话";

  return (
    <div
      className={`worker-panel-header ${isActive ? "is-active" : ""} ${row.hasHistory ? "" : "is-empty"}`}
    >
      <AgentIcon
        icon={icon}
        type={row.type}
        props={{
          icon: {
            className: "worker-panel-icon",
          },
          avatar: {
            className: "worker-panel-icon",
          },
        }}
      />
      <Flex vertical style={{ overflow: "hidden", flex: 1 }}>
        <Flex align="center" className="worker-panel-header-body">
          <Typography.Text ellipsis style={{ flex: 1 }}>
            {row.displayName}
            <span className="worker-panel-role">{row.role || "--"}</span>
          </Typography.Text>
          <Badge count={unreadCount} size="small" color="blue" />
          <Tooltip title="新建对话">
            <Button
              className="worker-panel-new"
              type="text"
              icon={<MaterialIcon name="add" />}
              onClick={(e) => onStartNewConversation(e, row.key)}
            />
          </Tooltip>
        </Flex>
        <Flex align="center" className="worker-panel-preview" gap={4}>
          <Typography.Text ellipsis style={{ flex: 1 }}>
            {preview}
          </Typography.Text>
          {lastChat?.hasPendingAwaiting && (
            <span className="chat-awaiting-status">等待批准</span>
          )}
          {!!lastChat?.updatedAt && (
            <span className="worker-panel-time-label">
              {formatChatTimeLabel(lastChat?.updatedAt)}
            </span>
          )}
        </Flex>
      </Flex>
    </div>
  );
};

const WorkerConversationPreviewList: React.FC<{
  row: WorkerRow;
  chats: WorkerConversationRow[];
  activeChatId: string;
  icon?: AgentIconConfig;
  showHeader?: boolean;
  getWorkerChatLoading: (chatId: string) => boolean;
  onSelectChat: (chatId: string) => void;
  onOpenHistory: (event: React.MouseEvent<Element>, workerKey: string) => void;
  onStartNewConversation: (
    e: React.MouseEvent<HTMLElement>,
    workerKey: string,
  ) => void;
}> = ({
  row,
  chats,
  activeChatId,
  icon,
  showHeader = false,
  getWorkerChatLoading,
  onSelectChat,
  onOpenHistory,
  onStartNewConversation,
}) => {
  const recentChats = chats.slice(0, 5);
  const unreadCount = chats
    .slice(5)
    .reduce((count, chat) => count + (isChatUnread(chat) ? 1 : 0), 0);

  return (
    <div className="worker-chat-preview-list">
      {showHeader && (
        <div className="worker-popover-header">
          <div className="worker-popover-header-main">
            <AgentIcon
              icon={icon}
              type={row.type}
              props={{
                icon: {
                  className: "worker-panel-icon worker-popover-header-icon",
                },
                avatar: {
                  className: "worker-panel-icon worker-popover-header-icon",
                },
              }}
            />
            <span className="worker-popover-header-title">
              {row.displayName}
            </span>
          </div>
          <Tooltip title="新建对话">
            <Button
              className="worker-panel-new worker-popover-new"
              type="text"
              icon={<MaterialIcon name="add" />}
              onClick={(e) => onStartNewConversation(e, row.key)}
            />
          </Tooltip>
        </div>
      )}
      <div className="worker-chat-divider"></div>
      {recentChats.length === 0 ? (
        <div className="status-line">暂无相关对话</div>
      ) : (
        <>
          {recentChats.map((chat) => (
            <WorkerChatPreviewItem
              key={chat.chatId}
              chat={chat}
              isActive={chat.chatId === activeChatId}
              loading={getWorkerChatLoading(chat.chatId)}
              onClick={() => onSelectChat(chat.chatId)}
            />
          ))}
        </>
      )}
      {chats.length > 5 && (
        <div
          className="worker-chat-more"
          onClick={(e) => onOpenHistory(e, row.key)}
        >
          查看更多（共 {chats.length} 条
          {unreadCount > 0 ? `，未读 ${unreadCount} 条` : ""}）
        </div>
      )}
    </div>
  );
};

export const LeftSidebar: React.FC = () => {
  const { state, dispatch, querySessionsRef } = useAppContext();
  const isSidebarLoading = state.sidebarPendingRequestCount > 0;
  const [expandedWorkerKey, setExpandedWorkerKey] = useState("");
  const [historyWorkerKey, setHistoryWorkerKey] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyIndex, setHistoryIndex] = useState(0);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const historyInputRef = useRef<HTMLInputElement>(null);
  const historyListRef = useRef<HTMLDivElement>(null);
  const historyItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const filteredChats = useMemo(() => {
    const filter = state.chatFilter.toLowerCase().trim();
    if (!filter) return state.chats;
    return state.chats.filter((chat) => {
      const name = (chat.chatName || "").toLowerCase();
      const id = (chat.chatId || "").toLowerCase();
      return name.includes(filter) || id.includes(filter);
    });
  }, [state.chats, state.chatFilter]);

  const workerBaseOrderByKey = useMemo(
    () => new Map(state.workerRows.map((row, index) => [row.key, index])),
    [state.workerRows],
  );

  const workerChatOrderByKey = useMemo(() => {
    const sortedChats = state.chats.slice().sort((a, b) => {
      const updatedA = Number(a?.updatedAt);
      const updatedB = Number(b?.updatedAt);
      const normalizedA = Number.isFinite(updatedA) ? updatedA : 0;
      const normalizedB = Number.isFinite(updatedB) ? updatedB : 0;

      if (normalizedA !== normalizedB) return normalizedB - normalizedA;

      const chatIdA = String(a?.chatId || "");
      const chatIdB = String(b?.chatId || "");
      return chatIdA.localeCompare(chatIdB);
    });

    const orderByKey = new Map<string, number>();
    sortedChats.forEach((chat) => {
      const workerKey = createWorkerKeyFromChat(chat);
      if (!workerKey || orderByKey.has(workerKey)) return;
      orderByKey.set(workerKey, orderByKey.size);
    });

    return orderByKey;
  }, [state.chats]);

  const filteredWorkerRows = useMemo(() => {
    const filter = state.chatFilter.toLowerCase().trim();
    const rows = !filter
      ? state.workerRows
      : state.workerRows.filter((row) =>
          String(row.searchText || "").includes(filter),
        );

    return rows.slice().sort((a, b) => {
      const chatOrderA = workerChatOrderByKey.get(a.key);
      const chatOrderB = workerChatOrderByKey.get(b.key);
      const hasChatsA = chatOrderA !== undefined;
      const hasChatsB = chatOrderB !== undefined;

      if (hasChatsA && hasChatsB) return chatOrderA - chatOrderB;
      if (hasChatsA !== hasChatsB) return hasChatsA ? -1 : 1;

      return (
        (workerBaseOrderByKey.get(a.key) ?? Number.MAX_SAFE_INTEGER) -
        (workerBaseOrderByKey.get(b.key) ?? Number.MAX_SAFE_INTEGER)
      );
    });
  }, [
    state.workerRows,
    state.chatFilter,
    workerBaseOrderByKey,
    workerChatOrderByKey,
  ]);

  const workerIconsByKey = useMemo(() => {
    const icons = new Map<string, AgentIconConfig>();
    for (const agent of state.agents) {
      if (!agent?.key || !agent.icon) continue;
      icons.set(`agent:${agent.key}`, agent.icon);
    }
    for (const team of state.teams) {
      if (!team?.teamId || !team.icon) continue;
      icons.set(`team:${team.teamId}`, team.icon);
    }
    return icons;
  }, [state.agents, state.teams]);

  const workerChatsByKey = useMemo(() => {
    const chatsByKey = new Map<string, WorkerConversationRow[]>();
    for (const row of state.workerRows) {
      chatsByKey.set(
        row.key,
        buildWorkerConversationRows({
          chats: state.chats,
          worker: row,
        }),
      );
    }
    return chatsByKey;
  }, [state.chats, state.workerRows]);

  const workerUnreadCountByKey = useMemo(() => {
    const unreadCounts = new Map<string, number>();
    for (const row of state.workerRows) {
      unreadCounts.set(
        row.key,
        resolveWorkerUnreadCount(row, state.agents, state.chats),
      );
    }
    return unreadCounts;
  }, [state.agents, state.chats, state.workerRows]);

  const historyWorker =
    state.workerIndexByKey.get(historyWorkerKey) ||
    state.workerRows.find((row) => row.key === historyWorkerKey) ||
    null;

  const historyRows = useMemo(
    () => workerChatsByKey.get(historyWorkerKey) || [],
    [historyWorkerKey, workerChatsByKey],
  );

  const filteredHistoryRows = useMemo(() => {
    const search = historySearch.trim().toLowerCase();
    if (!search) return historyRows;
    return historyRows.filter((row) => {
      const haystack = [row.chatName, row.chatId, row.lastRunContent]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [historyRows, historySearch]);

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
        detail: { workerKey },
      }),
    );
  };

  const handleStartNewConversationForWorker = (
    e: React.MouseEvent<HTMLElement>,
    workerKey: string,
  ) => {
    e.stopPropagation();
    const row =
      state.workerIndexByKey.get(workerKey) ||
      state.workerRows.find((item) => item.key === workerKey);
    if (!row) return;

    const workerChats = workerChatsByKey.get(workerKey) || [];
    flushSync(() => {
      dispatch({ type: "SET_WORKER_SELECTION_KEY", workerKey });
      dispatch({ type: "SET_WORKER_RELATED_CHATS", chats: workerChats });
      dispatch({
        type: "SET_WORKER_CHAT_PANEL_COLLAPSED",
        collapsed: true,
      });
    });

    window.dispatchEvent(new CustomEvent("agent:start-new-conversation"));
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

  const handleOpenHistory = (
    event: React.MouseEvent<Element>,
    workerKey: string,
  ) => {
    event.stopPropagation();
    setHistoryWorkerKey(workerKey);
    setHistorySearch("");
    setHistoryIndex(0);
  };

  const handleCloseHistory = () => {
    setHistoryWorkerKey("");
    setHistorySearch("");
    setHistoryIndex(0);
  };

  const handleSettingsMenuAction = (action: SidebarSettingsMenuAction) => {
    const shouldClose = dispatchSidebarSettingsAction(action, dispatch);
    if (shouldClose) {
      setSettingsMenuOpen(false);
    }
  };

  const getWorkerChatLoading = (chatId: string) => {
    if (!state.streaming) return false;
    for (const session of querySessionsRef.current.values()) {
      if (session.streaming && session.chatId === chatId) {
        return true;
      }
    }
    return false;
  };

  const workerCollapseItems: CollapseProps["items"] = filteredWorkerRows.map(
    (row) => {
      const rawChats = workerChatsByKey.get(row.key) || [];
      const icon = workerIconsByKey.get(row.key);
      const unreadCount = workerUnreadCountByKey.get(row.key) || 0;

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
            unreadCount={unreadCount}
            onStartNewConversation={handleStartNewConversationForWorker}
          />
        ),
        children: (
          <WorkerConversationPreviewList
            row={row}
            chats={rawChats}
            activeChatId={state.chatId}
            icon={icon}
            getWorkerChatLoading={getWorkerChatLoading}
            onSelectChat={handleSelectChat}
            onOpenHistory={handleOpenHistory}
            onStartNewConversation={handleStartNewConversationForWorker}
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

  return (
    <>
      <aside
        className={`sidebar left-sidebar ${state.leftDrawerOpen ? "is-open" : ""}`}
        id="left-sidebar"
      >
        {state.leftDrawerOpen && (
          <div className="sidebar-filter-row">
            <Input
              variant="filled"
              placeholder={
                state.conversationMode === "worker"
                  ? "按 名称 / key / teamId 过滤..."
                  : "搜索对话..."
              }
              value={state.chatFilter}
              prefix={<SearchOutlined style={{ color: "var(--text-muted)" }} />}
              onChange={(e) =>
                dispatch({
                  type: "SET_CHAT_FILTER",
                  filter: e.target.value,
                })
              }
            />
            <UiButton
              className="icon-btn icon-btn-fixed"
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
                  window.dispatchEvent(new CustomEvent("agent:refresh-chats"));
                }
              }}
            >
              <MaterialIcon name="refresh" />
            </UiButton>
          </div>
        )}

        {state.conversationMode !== "worker" && (
          <div className="chat-meta">
            <span className="chat-meta-label">智能体</span>
            {state.chatId && state.chatAgentById.has(state.chatId) && (
              <UiTag className="chip" tone="accent">
                {state.chatAgentById.get(state.chatId)}
              </UiTag>
            )}
          </div>
        )}

        <div className="chat-list" id="chat-list">
          <Spin spinning={isSidebarLoading} tip="加载中...">
            {state.conversationMode === "worker" ? (
              filteredWorkerRows.length === 0 ? (
                <div className="status-line">暂无员工/小组</div>
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
                <Flex vertical gap={10}>
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
                            getWorkerChatLoading={getWorkerChatLoading}
                            onSelectChat={handleSelectChat}
                            onOpenHistory={handleOpenHistory}
                            onStartNewConversation={
                              handleStartNewConversationForWorker
                            }
                          />
                        }
                      >
                        <Button
                          type="text"
                          className={`worker-collapsed-icon ${item.key === state.workerSelectionKey ? "is-active" : ""}`}
                          onClick={() => handleSelectWorker(item.key)}
                        >
                          <Badge dot={unreadCount > 0}>
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
                          </Badge>
                          <span className="worker-collapsed-name">
                            {item.displayName}
                          </span>
                        </Button>
                      </Popover>
                    );
                  })}
                </Flex>
              )
            ) : filteredChats.length === 0 ? (
              <div className="status-line">暂无对话</div>
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
            className="icon-btn sidebar-settings-trigger"
            id="settings-btn"
            variant="ghost"
            aria-label="打开设置菜单"
            aria-haspopup="menu"
            aria-expanded={settingsMenuOpen}
          >
            <MaterialIcon name="settings" />
            {state.leftDrawerOpen && (
              <>
                <span>设置</span>
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
      </aside>

      <Modal
        open={Boolean(historyWorkerKey)}
        onCancel={handleCloseHistory}
        footer={null}
        destroyOnHidden
        width="min(780px, calc(100vw - 32px))"
        className="worker-history-modal"
        title={
          historyWorker
            ? `${historyWorker.type === "team" ? "小组" : "员工"}历史对话 · ${historyWorker.displayName}`
            : "历史对话"
        }
      >
        <HistoryModal
          historyRows={filteredHistoryRows}
          historyIndex={Math.min(
            historyIndex,
            Math.max(filteredHistoryRows.length - 1, 0),
          )}
          historySearch={historySearch}
          historyInputRef={historyInputRef}
          historyListRef={historyListRef}
          historyItemRefs={historyItemRefs}
          onHistorySearchChange={(value) => {
            setHistorySearch(value);
            setHistoryIndex(0);
          }}
          onActivateIndex={setHistoryIndex}
          onSelect={(index) => {
            const target = filteredHistoryRows[index];
            if (!target) return;
            handleCloseHistory();
            handleSelectChat(target.chatId);
          }}
        />
      </Modal>
    </>
  );
};
