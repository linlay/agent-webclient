import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Collapse,
  CollapseProps,
  Flex,
  Modal,
  Spin,
  Tooltip,
  Typography,
} from "antd";
import { useAppContext } from "../../context/AppContext";
import { MaterialIcon } from "../common/MaterialIcon";
import { HistoryModal } from "../modal/HistoryModal";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";
import { UiListItem } from "../ui/UiListItem";
import { UiTag } from "../ui/UiTag";
import {
  formatChatTimeLabel,
  pickChatAgentLabel,
} from "../../lib/chatListFormatter";
import { buildWorkerConversationRows } from "../../lib/workerConversationFormatter";
import type {
  Chat,
  WorkerConversationRow,
  WorkerRow,
} from "../../context/types";
import { AgentIcon } from "@/icons/agent";

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
        <div className="worker-chat-item-badge"></div>
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
}> = ({ row, isActive, icon }) => {
  const preview =
    row.latestRunContent ||
    (row.hasHistory ? row.latestChatName : "暂无历史对话");

  const handleStartNewConversation = (
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent("agent:start-new-conversation"));
  };

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
          {!!row.latestUpdatedAt && (
            <div className="worker-panel-time">
              {formatChatTimeLabel(row.latestUpdatedAt)}
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

  const filteredWorkerRows = useMemo(() => {
    const filter = state.chatFilter.toLowerCase().trim();
    if (!filter) return state.workerRows;
    return state.workerRows.filter((row) =>
      String(row.searchText || "").includes(filter),
    );
  }, [state.workerRows, state.chatFilter]);

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
    console.log(event.target);
    setHistoryWorkerKey(workerKey);
    setHistorySearch("");
    setHistoryIndex(0);
  };

  const handleCloseHistory = () => {
    setHistoryWorkerKey("");
    setHistorySearch("");
    setHistoryIndex(0);
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
    },
  );

  return (
    <>
      <aside
        className={`sidebar left-sidebar ${state.leftDrawerOpen || state.layoutMode !== "mobile-drawer" ? "is-open" : ""}`}
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
            inputSize="md"
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
      </aside>

      <Modal
        open={Boolean(historyWorkerKey)}
        onCancel={handleCloseHistory}
        footer={null}
        destroyOnClose
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
