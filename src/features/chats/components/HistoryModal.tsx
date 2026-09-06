import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./HistoryModal.module.css";
import { DatePicker, Flex, Input, InputRef, Popover, Tag, Tooltip } from "antd";
import dayjs from "dayjs";
import type { AppState } from "@/app/state/AppContext";
import type { Chat } from "@/features/chats/lib/chatState";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
import { isChatActiveRun } from "@/features/chats/lib/chatRunState";
import {
  formatChatTimeLabel,
  resolveConversationDisplayTitle,
} from "@/features/chats/lib/chatListFormatter";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiListItem } from "@/shared/ui/UiListItem";
import { UiButton } from "@/shared/ui/UiButton";
import useApp from "antd/es/app/useApp";
import { useI18n } from "@/shared/i18n";
import {
  getChats,
  markChatRead,
  searchGlobal,
} from "@/shared/data";
import { mergeFetchedChats } from "@/features/chats/lib/chatSummary";
import { useAppContext } from "@/app/state/provider";
import { AgentSelector } from "@/features/chats/components/AgentSelector";
import { ModalTitleBar } from "@/shared/ui/ModalTitleBar";
import { readEpochMillis } from "@/shared/utils/platformTime";
import { useChatOperations } from "@/features/chats/hooks/useChatOperations";

const HISTORY_MODAL_TITLE_TAG_CLASS =
  "history-modal-title-tag tw:rounded-[10px] tw:bg-accent-soft tw:px-1.5 tw:py-0.5 tw:text-xs tw:font-normal tw:text-accent";

function getAwaitingStatusKey(mode?: string): string {
  switch (mode) {
    case "plan":
    case "planning":
      return "leftSidebar.awaitingStatus.plan";
    case "question":
      return "leftSidebar.awaitingStatus.question";
    case "approval":
      return "leftSidebar.awaitingStatus.approval";
    case "form":
      return "leftSidebar.awaitingStatus.form";
    default:
      return "leftSidebar.awaitingApproval";
  }
}

function isChatForAgents(chat: Chat, agentKeys: string[]): boolean {
  if (agentKeys.length === 0) return true;
  const chatAgentKey = String(
    chat?.agentKey || chat?.firstAgentKey || "",
  ).trim();
  if (!chatAgentKey) return false;
  return agentKeys.some((key) => String(key || "").trim() === chatAgentKey);
}

function isChatWithinUpdatedRange(
  chat: Chat,
  range: [number, number] | null,
): boolean {
  if (!range) return true;
  const updated = readEpochMillis(chat.updatedAt) ?? 0;
  return updated >= range[0] && updated <= range[1];
}

function resolveCurrentAgentKey(
  state: Pick<
    AppState,
    "chatId" | "chats" | "chatAgentById" | "workerSelectionKey"
  >,
): string {
  const chatId = String(state.chatId || "").trim();
  if (chatId) {
    const chat = (Array.isArray(state.chats) ? state.chats : []).find(
      (item) => String(item?.chatId || "") === chatId,
    );
    const agentKey = String(
      chat?.agentKey ||
        chat?.firstAgentKey ||
        state.chatAgentById?.get(chatId) ||
        "",
    ).trim();
    if (agentKey) return agentKey;
  }
  const selectionKey = String(state.workerSelectionKey || "").trim();
  if (selectionKey.startsWith("agent:")) {
    return selectionKey.slice("agent:".length);
  }
  return "";
}

function compareChatFreshness(a: Chat, b: Chat): number {
  const updatedA = readEpochMillis(a?.updatedAt) ?? 0;
  const updatedB = readEpochMillis(b?.updatedAt) ?? 0;
  if (updatedA !== updatedB) return updatedB - updatedA;
  return String(a?.chatId || "").localeCompare(String(b?.chatId || ""));
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

export const HistoryModal: React.FC<{
  onSelectChat: (chatId: string) => void;
  onClose?: () => void;
  titleBarVariant?: "default" | "drawer";
}> = ({ onSelectChat, onClose, titleBarVariant = "default" }) => {
  const { modal, message } = useApp();
  const inputRef = useRef<InputRef>(null);
  const historyListRef = useRef<HTMLDivElement>(null);
  const historyItemRefs = useRef<Array<HTMLElement | null>>([]);
  const { state, dispatch } = useAppContext();
  const { t } = useI18n();
  const { pending, archive, remove, exportChat } = useChatOperations(
    state.chatId, dispatch, t,
  );
  const [remoteHistoryRows, setRemoteHistoryRows] = useState<Chat[] | null>(
    null,
  );
  const [historySearch, setHistorySearch] = useState("");
  const [historyIndex, setHistoryIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAgentKeys, setSelectedAgentKeys] = useState<string[]>(() => {
    const agentKey = resolveCurrentAgentKey(state);
    return agentKey ? [agentKey] : [];
  });
  const [updatedRange, setUpdatedRange] = useState<[number, number] | null>(
    null,
  );
  const defaultSelectionAppliedRef = useRef(false);
  const chatsRef = useRef(state.chats);

  useEffect(() => {
    chatsRef.current = state.chats;
  }, [state.chats]);

  const agents = useMemo(
    () => (Array.isArray(state.agents) ? state.agents : []),
    [state.agents],
  );

  const agentNameByKey = useMemo(() => {
    const map = new Map<string, string>();
    agents.forEach((agent) => {
      if (agent?.key) map.set(String(agent.key), agent.name || agent.key);
    });
    return map;
  }, [agents]);

  const resolveAgentName = (chat: Chat): string => {
    const key = String(chat?.agentKey || chat?.firstAgentKey || "").trim();
    return key ? agentNameByKey.get(key) || key : "";
  };

  const localHistoryRows = useMemo(() => {
    const chats = Array.isArray(state.chats) ? state.chats : [];
    return chats
      .filter(
        (chat) =>
          isChatForAgents(chat, selectedAgentKeys) &&
          isChatWithinUpdatedRange(chat, updatedRange) &&
          String(chat?.chatId || ""),
      )
      .slice()
      .sort(compareChatFreshness);
  }, [state.chats, selectedAgentKeys, updatedRange]);

  useEffect(() => {
    const query = historySearch.trim();
    if (selectedAgentKeys.length === 0 || !query) {
      setRemoteHistoryRows(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void Promise.all(
        selectedAgentKeys.map((agentKey) =>
          searchGlobal({ query, agentKey, limit: 30 }),
        ),
      )
        .then((responses) => {
          const seenChatIds = new Set<string>();
          const rows: Chat[] = [];
          responses.forEach((response) => {
            const results = Array.isArray(response.data?.results)
              ? response.data.results
              : [];
            results.forEach((result) => {
              const chat: Chat = {
                chatId: String(result.chatId || ""),
                chatName: String(result.chatName || ""),
                agentKey: result.agentKey,
                teamId: result.teamId,
                updatedAt: readEpochMillis(result.timestamp) ?? 0,
                lastRunId: String(result.runId || ""),
                lastRunContent: String(result.snippet || ""),
                searchSnippet: String(result.snippet || ""),
                isRead: true,
              };
              if (!chat.chatId || seenChatIds.has(chat.chatId)) return;
              seenChatIds.add(chat.chatId);
              rows.push(chat);
            });
          });
          setRemoteHistoryRows(
            rows.filter((chat) => isChatWithinUpdatedRange(chat, updatedRange)),
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
  }, [dispatch, historySearch, selectedAgentKeys, updatedRange]);

  const historyRows = useMemo(() => {
    if (remoteHistoryRows) return remoteHistoryRows;
    const search = historySearch.trim().toLowerCase();
    if (!search) return localHistoryRows;
    return localHistoryRows.filter((chat) =>
      [chat.chatName, chat.chatId, chat.lastRunContent]
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [localHistoryRows, historySearch, remoteHistoryRows]);

  const activeIndex = clampIndex(historyIndex, historyRows.length);
  const unreadCount = historyRows.reduce(
    (count, chat) => count + (isChatUnread(chat) ? 1 : 0),
    0,
  );

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [selectedAgentKeys]);

  const loadChats = useCallback(
    async (agentKeys: string[], options?: { replace?: boolean }) => {
      if (agentKeys.length === 0) return;
      setRefreshing(true);
      try {
        const responses = await Promise.all(
          agentKeys.map((agentKey) => getChats({ agentKey })),
        );
        let chats = options?.replace
          ? []
          : chatsRef.current;
        responses.forEach((response) => {
          const fetchedChats = Array.isArray(response.data)
            ? (response.data as Chat[])
            : [];
          chats = mergeFetchedChats(chats, fetchedChats);
        });
        if (options?.replace) {
          // 刷新时丢弃本地已删除 / 已归档但仍在 state.chats 里的旧记录
          const fetchedChatIds = new Set(
            chats.map((chat) => String(chat?.chatId || "")),
          );
          chats = chats.filter((chat) => fetchedChatIds.has(String(chat?.chatId || "")));
          // 合并未被本次请求覆盖的其他 agent 的 chat，避免误删
          chatsRef.current.forEach((chat) => {
            const chatId = String(chat?.chatId || "");
            if (!chatId || fetchedChatIds.has(chatId)) return;
            const agentKey = String(chat?.agentKey || chat?.firstAgentKey || "").trim();
            if (agentKeys.includes(agentKey)) return;
            chats = [chat, ...chats];
          });
        }
        dispatch({ type: "SET_CHATS", chats });
      } catch (error) {
        dispatch({
          type: "APPEND_DEBUG",
          line: `[loadChats error] ${(error as Error).message}`,
        });
      } finally {
        setRefreshing(false);
      }
    },
    [dispatch],
  );

  useEffect(() => {
    if (selectedAgentKeys.length === 0 || historySearch.trim()) return;
    void loadChats(selectedAgentKeys);
  }, [historySearch, loadChats, selectedAgentKeys]);

  useEffect(() => {
    defaultSelectionAppliedRef.current = false;
  }, [selectedAgentKeys, updatedRange]);

  useEffect(() => {
    if (historySearch) {
      defaultSelectionAppliedRef.current = false;
      return;
    }
    if (defaultSelectionAppliedRef.current) return;
    const currentChatId = String(state.chatId || "").trim();
    if (!currentChatId) return;
    const currentChatIndex = historyRows.findIndex(
      (chat) => String(chat.chatId || "") === currentChatId,
    );
    if (currentChatIndex < 0) return;
    defaultSelectionAppliedRef.current = true;
    if (historyIndex !== currentChatIndex) {
      setHistoryIndex(currentChatIndex);
    }
  }, [historyRows, historyIndex, historySearch, state.chatId]);

  useEffect(() => {
    historyItemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const getHistoryTitle = (chat: Chat) =>
    resolveConversationDisplayTitle(chat, t("leftSidebar.titleUntitled"));

  const removeRemoteHistoryRow = (chatId: string) => {
    setRemoteHistoryRows((rows) =>
      rows ? rows.filter((row) => String(row.chatId || "") !== chatId) : rows,
    );
  };

  const handleHistoryKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (historyRows.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHistoryIndex(clampIndex(activeIndex + delta, historyRows.length));
      const listElement = historyListRef.current;
      if (!listElement || !listElement.contains(event.target as Node)) {
        window.requestAnimationFrame(() => {
          listElement?.focus();
        });
      }
      return;
    }
    if (event.key === "Enter") {
      const target = historyRows[activeIndex];
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      onSelectChat(target.chatId);
    }
  };

  const handleAgentsChange = (agentKeys: string[]) => {
    setSelectedAgentKeys(agentKeys);
    setHistoryIndex(0);
  };

  const handleRefresh = () => {
    setHistorySearch("");
    const agentKeys =
      selectedAgentKeys.length > 0
        ? selectedAgentKeys
        : agents
            .map((agent) => String(agent?.key || "").trim())
            .filter(Boolean);
    void loadChats(agentKeys, { replace: true });
  };

  const handleMarkAllRead = async (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    const agentKeys =
      selectedAgentKeys.length > 0
        ? selectedAgentKeys
        : agents
            .map((agent) => String(agent?.key || "").trim())
            .filter(Boolean);
    if (agentKeys.length === 0) return;
    agentKeys.forEach((agentKey) =>
      dispatch({ type: "MARK_AGENT_CHATS_READ", agentKey }),
    );
    try {
      await Promise.all(
        agentKeys.map((agentKey) => markChatRead({ agentKey })),
      );
    } catch (error) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[mark all read error] ${(error as Error).message}`,
      });
      window.dispatchEvent(new CustomEvent("agent:refresh-worker-data"));
    }
  };

  const handleExport = async (chatId: string, format: "markdown" | "html") => {
    if (!chatId || pending) return;
    try {
      await exportChat(chatId, format);
      message.success(
        t(format === "html" ? "history.exportedHtml" : "history.exported"),
      );
    } catch {
      message.error(
        t(
          format === "html"
            ? "history.exportHtmlFailed"
            : "history.exportFailed",
        ),
      );
    }
  };
  const handleArchive = (chat: Chat) => {
    if (!chat || !chat?.chatId || pending) return;
    modal.confirm({
      title: t("chatActions.archive.title"),
      content: getHistoryTitle(chat),
      okText: t("chatActions.archive.ok"),
      cancelText: t("chatActions.cancel"),
      onOk: async () => {
        await archive(chat.chatId, removeRemoteHistoryRow);
      },
    });
  };
  const handleDelete = (chat: Chat) => {
    if (!chat || !chat?.chatId || pending) return;
    modal.confirm({
      title: t("chatActions.delete.title"),
      content: getHistoryTitle(chat),
      okText: t("chatActions.delete.ok"),
      okButtonProps: { danger: true },
      cancelText: t("chatActions.cancel"),
      onOk: async () => {
        await remove(chat.chatId, removeRemoteHistoryRow);
      },
    });
  };
  return (
    <div className="command-modal-section" onKeyDown={handleHistoryKeyDown}>
      <ModalTitleBar
        variant={titleBarVariant}
        onClose={() => onClose?.()}
        className="history-modal-title"
      >
        <Input
          ref={inputRef}
          prefix={
            <MaterialIcon
              name="search"
              className="sidebar-static-icon"
              style={{ color: "var(--text-muted)" }}
            />
          }
          variant="borderless"
          placeholder={t("history.searchPlaceholder")}
          value={historySearch}
          onChange={(event) => {
            setHistorySearch(event.target.value);
            setHistoryIndex(0);
          }}
        />
        {titleBarVariant === "drawer" ? null : (
        <Popover
          trigger="click"
          placement="bottomLeft"
          arrow={false}
          content={
            <div className="history-filter-popover">
              <div className="history-filter-row">
                <span className="history-filter-row-label">
                  {t("history.filter.agents")}
                </span>
                <AgentSelector
                  value={selectedAgentKeys}
                  onChange={handleAgentsChange}
                />
              </div>
              <div className="history-filter-row">
                <span className="history-filter-row-label">
                  {t("history.filter.updatedAt")}
                </span>
                <DatePicker.RangePicker
                  allowClear
                  format="YYYY-MM-DD"
                  aria-label={t("history.global.date.ariaLabel")}
                  placeholder={[
                    t("history.global.date.start"),
                    t("history.global.date.end"),
                  ]}
                  value={
                    updatedRange
                      ? [dayjs(updatedRange[0]), dayjs(updatedRange[1])]
                      : null
                  }
                  onChange={(values) => {
                    if (!values?.[0] || !values?.[1]) {
                      setUpdatedRange(null);
                      return;
                    }
                    setUpdatedRange([
                      values[0].startOf("day").valueOf(),
                      values[1].endOf("day").valueOf(),
                    ]);
                  }}
                />
              </div>
            </div>
          }
        >
          <button
            type="button"
            className="history-filter-trigger"
            aria-label={t("history.filter")}
          >
            <MaterialIcon name="filter_list" />
            <span className="history-filter-trigger-label">
              {t("history.filter")}
            </span>
            <span className="history-filter-trigger-count">
              {selectedAgentKeys.length}/{agents.length}
            </span>
          </button>
        </Popover>
        )}
        <Tooltip title={t("history.refresh")}>
          <UiButton
            className="ui-icon-hover-24"
            size="sm"
            variant="ghost"
            iconOnly
            loading={refreshing}
            onClick={handleRefresh}
          >
            <MaterialIcon name="refresh" />
          </UiButton>
        </Tooltip>
        <div className={HISTORY_MODAL_TITLE_TAG_CLASS}>
          {t("leftSidebar.historyCount", { count: historyRows.length })}
        </div>
      </ModalTitleBar>
      {unreadCount > 0 && (
        <div className="command-history-toolbar">
          <div className="command-history-toolbar-actions">
            <UiButton
              className="command-history-action"
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
            >
              {t("history.markAllRead")}
            </UiButton>
          </div>
        </div>
      )}
      {historyRows.length === 0 ? (
        <div className="command-empty-state">{t("history.empty")}</div>
      ) : (
        <div
          ref={historyListRef}
          className="command-modal-list command-modal-list-focusable history-list-container"
          tabIndex={0}
          role="listbox"
          aria-label={t("history.ariaLabel")}
        >
          {historyRows.map((chat, index) => {
            const historyTitle = getHistoryTitle(chat);
            const agentName = resolveAgentName(chat);
            return (
              <UiListItem
                ref={(element) => {
                  historyItemRefs.current[index] = element;
                }}
                key={chat.chatId}
                className={`command-list-item history-list-item ${index === activeIndex ? "is-active" : ""}`}
                selected={index === activeIndex}
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => onSelectChat(chat.chatId)}
              >
                <Flex align="center" gap={6} className="history-list-summary">
                  <span className="history-list-title">{historyTitle}</span>
                  {isChatUnread(chat) ? (
                    <Tag color="blue">{t("history.unread")}</Tag>
                  ) : null}
                  {isChatActiveRun(chat) ? (
                    <Tag color="processing" className="history-list-status">
                      {t("history.running")}
                    </Tag>
                  ) : null}
                  {chat.hasPendingAwaiting ? (
                    <Tag color="gold" className="history-list-status">
                      {t(getAwaitingStatusKey(chat.awaiting?.mode))}
                    </Tag>
                  ) : null}
                  {agentName ? (
                    <span className="history-list-agent-name">{agentName}</span>
                  ) : null}
                  <span className="history-list-action-time">
                    {formatChatTimeLabel(readEpochMillis(chat.updatedAt))}
                  </span>
                </Flex>
                <Flex align="center" className="history-list-actions">
                  <Tooltip title={t("history.action.export")}>
                    <UiButton
                      className="ui-icon-hover-24"
                      size="sm"
                      variant="ghost"
                      iconOnly
                      loading={pending}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(chat.chatId, "markdown");
                      }}
                    >
                      <MaterialIcon
                        name="export"
                        style={{ color: "var(--accent)" }}
                      />
                    </UiButton>
                  </Tooltip>
                  <Tooltip title={t("history.action.exportHtml")}>
                    <UiButton
                      className="ui-icon-hover-24"
                      size="sm"
                      variant="ghost"
                      iconOnly
                      loading={pending}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(chat.chatId, "html");
                      }}
                    >
                      <MaterialIcon
                        name="html"
                        style={{ color: "var(--accent)" }}
                      />
                    </UiButton>
                  </Tooltip>
                  <Tooltip title={t("history.action.archive")}>
                    <UiButton
                      className="ui-icon-hover-24"
                      size="sm"
                      variant="ghost"
                      iconOnly
                      onClick={(e) => {
                        e.stopPropagation();
                        handleArchive(chat);
                      }}
                    >
                      <MaterialIcon name="inventory_2" />
                    </UiButton>
                  </Tooltip>
                  <Tooltip title={t("history.action.delete")}>
                    <UiButton
                      className="ui-icon-hover-24"
                      size="sm"
                      variant="ghost"
                      iconOnly
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(chat);
                      }}
                    >
                      <MaterialIcon
                        name="delete"
                        style={{ color: "var(--accent-danger)" }}
                      />
                    </UiButton>
                  </Tooltip>
                </Flex>
                <div className="command-list-preview">
                  {chat.searchSnippet ||
                    chat.lastRunContent ||
                    t("history.noPreview")}
                </div>
              </UiListItem>
            );
          })}
        </div>
      )}
    </div>
  );
};
