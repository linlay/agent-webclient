import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Collapse,
  CollapseProps,
  Flex,
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
import { buildWorkerConversationRows } from "@/features/workers/lib/workerConversationFormatter";
import { createWorkerKeyFromChat } from "@/features/workers/lib/workerListFormatter";
import type { Chat, WorkerConversationRow, WorkerRow } from "@/app/state/types";
import { AgentIcon } from "@/shared/icons/agent";

type AgentIconConfig = {
  color?: string;
  name?: string;
};

const ChatItem: React.FC<{
  chat: Chat;
  agents: Array<{ key?: string; name?: string }>;
  isActive: boolean;
  onClick: () => void;
}> = ({ chat, agents, isActive, onClick }) => {
  const label = pickChatAgentLabel(chat, agents);
  const time = formatChatTimeLabel(chat.updatedAt);
  const title = chat.chatName || chat.chatId || "(无标题)";

  return (
    <UiListItem
      className={`chat-item ${isActive ? "is-active" : ""}`}
      selected={isActive}
      dense
      onClick={onClick}
    >
      <div className="chat-item-head">
        <div className="chat-title-wrap">
          <div className="chat-title">{title}</div>
        </div>
        <div className="chat-time">{time}</div>
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
        <span className="worker-chat-name">
          {chat.lastRunContent || chat.chatName || "(无预览)"}
        </span>
        <span className="worker-chat-time">
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
}> = ({ row, isActive, icon, lastChat }) => {
  const handleStartNewConversation = (
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent("agent:start-new-conversation"));
  };
  const preview = lastChat
    ? lastChat?.lastRunContent || lastChat?.chatName || "最新对话无答复"
    : "暂无历史对话";

  return (
    <div
      className={`worker-panel-header ${isActive ? "is-active" : ""} ${row.hasHistory ? "" : "is-empty"}`}
    >
      <AgentIcon icon={icon} type={row.type} />
      <Flex className="worker-panel-header-body" vertical>
        <Flex align="center">
          <Typography.Text ellipsis style={{ flex: 1 }}>
            {row.displayName}
            <span className="worker-panel-role">{row.role || "--"}</span>
          </Typography.Text>
          {!!lastChat?.updatedAt && (
            <div className="worker-panel-time">
              {formatChatTimeLabel(lastChat?.updatedAt)}
            </div>
          )}
          <Tooltip title="新建对话">
            <Button
              className="worker-panel-new"
              type="text"
              icon={<MaterialIcon name="add" />}
              onClick={handleStartNewConversation}
            />
          </Tooltip>
        </Flex>
        <Typography.Text ellipsis className="worker-panel-preview">
          {preview}
        </Typography.Text>
      </Flex>
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
    if (state.layoutMode === "mobile-drawer") {
      dispatch({ type: "SET_LEFT_DRAWER_OPEN", open: false });
    }
  };

  const handleSelectWorker = (workerKey: string) => {
    window.dispatchEvent(
      new CustomEvent("agent:select-worker", {
        detail: { workerKey },
      }),
    );
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

  const workerCollapseItems = useMemo<CollapseProps["items"]>(
    () =>
      filteredWorkerRows.map((row) => {
        const rawChats = workerChatsByKey.get(row.key) || [];
        const recentChats = rawChats.slice(0, 5);
        return {
          key: row.key,
          className: `worker-collapse-item ${row.key === state.workerSelectionKey ? "is-selected" : ""}`,
          showArrow: false,
          label: (
            <WorkerPanelHeader
              row={row}
              isActive={row.key === state.workerSelectionKey}
              icon={workerIconsByKey.get(row.key)}
              lastChat={rawChats[0]}
            />
          ),
          children: (
            <div>
              <div className="worker-chat-divider"></div>
              {recentChats.length === 0 ? (
                <div className="status-line">暂无相关对话</div>
              ) : (
                <>
                  {recentChats.map((chat) => (
                    <WorkerChatPreviewItem
                      key={chat.chatId}
                      chat={chat}
                      isActive={chat.chatId === state.chatId}
                      loading={getWorkerChatLoading(chat.chatId)}
                      onClick={() => handleSelectChat(chat.chatId)}
                    />
                  ))}
                </>
              )}
              {rawChats.length > 5 && (
                <div
                  className="worker-chat-more"
                  onClick={(e) => handleOpenHistory(e, row.key)}
                >
                  查看更多
                </div>
              )}
            </div>
          ),
        };
      }),
    [
      filteredWorkerRows,
      workerChatsByKey,
      state.chatId,
      state.workerSelectionKey,
      workerIconsByKey,
    ],
  );

  const settingsSummaryBadges = useMemo(
    () =>
      resolveSettingsSummaryBadges({
        transportMode: state.transportMode,
        themeMode: state.themeMode,
        wsStatus: state.wsStatus,
        wsErrorMessage: state.wsErrorMessage,
      }),
    [state.themeMode, state.transportMode, state.wsErrorMessage, state.wsStatus],
  );

  return (
    <>
      <aside
        className={`sidebar left-sidebar ${state.leftDrawerOpen ? "is-open" : ""}`}
        id="left-sidebar"
      >
        {state.conversationMode !== "worker" && (
          <label
            className="field-label field-label-spaced"
            htmlFor="chat-search"
          >
            搜索
          </label>
        )}
        <div className="sidebar-filter-row">
          <UiInput
            id="chat-search"
            inputSize="sm"
            type="text"
            placeholder={
              state.conversationMode === "worker"
                ? "按 名称 / key / teamId 过滤..."
                : "搜索对话..."
            }
            value={state.chatFilter}
            style={{
              border: 0,
            }}
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
            <span>刷新</span>
          </UiButton>
        </div>

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
              ) : (
                <Collapse
                  accordion
                  ghost
                  className="worker-collapse"
                  activeKey={expandedWorkerKey || undefined}
                  items={workerCollapseItems}
                  onChange={handleWorkerCollapseChange}
                />
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
          trigger="click"
          placement="topLeft"
          overlayClassName="sidebar-settings-popover"
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
