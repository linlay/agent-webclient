import React, { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Badge,
  Button,
  Collapse,
  CollapseProps,
  Flex,
  Input,
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
import { useI18n } from "@/shared/i18n";
import { selectNavigationState } from "@/app/state/selectors";
import { AgentIcon } from "@/shared/icons/agent";
import { useLeftSidebarData } from "@/app/layout/hooks/useLeftSidebarData";
import { ChatItem } from "@/app/layout/sidebar/ChatItem";
import { WorkerPanelHeader } from "@/app/layout/sidebar/WorkerPanelHeader";
import { WorkerConversationPreviewList } from "@/app/layout/sidebar/WorkerConversationPreviewList";
import { SidebarHistorySection } from "@/app/layout/sidebar/SidebarHistorySection";
import {
  markChatRead,
  searchGlobal,
} from "@/features/transport/lib/apiClientProxy";
import type { WorkerConversationRow } from "@/app/state/types";

function findChatIndex(rows: WorkerConversationRow[], chatId: string): number {
  const normalizedChatId = String(chatId || "").trim();
  if (!normalizedChatId) return -1;
  return rows.findIndex(
    (row) => String(row.chatId || "").trim() === normalizedChatId,
  );
}

export const LeftSidebar: React.FC = () => {
  const { state, dispatch, querySessionsRef } = useAppContext();
  const { t } = useI18n();
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
    const workerChats = workerChatsByKey.get(workerKey) || [];
    const currentChatIndex = findChatIndex(workerChats, state.chatId);
    setHistoryWorkerKey(workerKey);
    setHistorySearch("");
    setHistoryIndex(currentChatIndex >= 0 ? currentChatIndex : 0);
  };

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
            onMarkAllRead={handleMarkWorkerAllRead}
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
            onMarkAllRead={handleMarkWorkerAllRead}
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
          <>
            <Flex className="left-sidebar-buttons" gap={2}>
              <UiButton
                size="sm"
                variant="ghost"
                onClick={() => {
                  dispatch({
                    type: "OPEN_COMMAND_MODAL",
                    modal: { type: "schedule" },
                  });
                }}
              >
	                <MaterialIcon name="schedule" />
	                <Flex gap={4} align="center">
	                  <span>自动化</span>
	                </Flex>
	              </UiButton>
              <UiButton size="sm" variant="ghost">
                <MaterialIcon name="neurology" />
                <Flex gap={4} align="center">
                  <span>记忆</span>
                  <Badge count={8} />
                </Flex>
              </UiButton>
            </Flex>
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
                            onMarkAllRead={handleMarkWorkerAllRead}
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
