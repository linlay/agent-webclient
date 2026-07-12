import React, { useEffect, useRef, useState } from "react";
import { Flex, Input, InputRef, Tag, Tooltip } from "antd";
import type { WorkerConversationRow } from "@/app/state/types";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
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
  archiveChats,
  deleteChat,
  downloadChatExport,
} from "@/shared/data";
import { useAppContext } from "@/app/state/provider";

export const HistoryModal: React.FC<{
  historyRows: WorkerConversationRow[];
  historyIndex: number;
  historySearch: string;
  historyLoading?: boolean;
  historyError?: string;
  historyInputRef: React.RefObject<HTMLInputElement>;
  historyListRef: React.RefObject<HTMLDivElement>;
  historyItemRefs: React.MutableRefObject<Array<HTMLElement | null>>;
  onHistorySearchChange: (value: string) => void;
  onActivateIndex: (index: number) => void;
  onSelect: (index: number) => void;
  onMarkAllRead?: (event: React.MouseEvent<HTMLElement>) => void;
  onChatDeleted?: (chatId: string) => void;
}> = ({
  historyRows,
  historyIndex,
  historySearch,
  historyLoading = false,
  historyError = "",
  historyListRef,
  historyItemRefs,
  onHistorySearchChange,
  onSelect,
  onMarkAllRead,
  onChatDeleted,
}) => {
  const { modal, message } = useApp();
  const inputRef = useRef<InputRef>(null);
  const { state, dispatch } = useAppContext();
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const unreadCount = historyRows.reduce(
    (count, chat) => count + (isChatUnread(chat) ? 1 : 0),
    0,
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const getHistoryTitle = (chat: WorkerConversationRow) =>
    resolveConversationDisplayTitle(chat, t("leftSidebar.titleUntitled"));
  const handleExport = async (chatId: string) => {
    if (!chatId || pending) return;
    setPending(true);
    try {
      await downloadChatExport(chatId);
      message.success(t("history.exported"));
    } catch (error) {
      message.error(t("history.exportFailed"));
      dispatch({
        type: "APPEND_DEBUG",
        line: `[export chat error] ${(error as Error).message}`,
      });
    } finally {
      setPending(false);
    }
  };
  const handleArchive = (chat: WorkerConversationRow) => {
    if (!chat || !chat?.chatId || pending) return;
    modal.confirm({
      title: t("chatActions.archive.title"),
      content: getHistoryTitle(chat),
      okText: t("chatActions.archive.ok"),
      cancelText: t("chatActions.cancel"),
      onOk: async () => {
        setPending(true);
        try {
          const response = await archiveChats({ chatIds: [chat.chatId] });
          const result = response.data?.results?.[0];
          if (!result?.success) {
            throw new Error(result?.error || t("chatActions.archive.failed"));
          }
          dispatch({ type: "CHAT_ARCHIVED", chatId: chat.chatId });
          onChatDeleted?.(chat.chatId);
          clearActiveChatIfNeeded(chat.chatId);
        } catch (error) {
          dispatch({
            type: "APPEND_DEBUG",
            line: `[archive chat error] ${(error as Error).message}`,
          });
          throw error;
        } finally {
          setPending(false);
        }
      },
    });
  };
  const clearActiveChatIfNeeded = (chatId: string) => {
    if (String(state.chatId || "") !== chatId) {
      return;
    }
    dispatch({ type: "SET_CHAT_ID", chatId: "" });
    dispatch({ type: "SET_RUN_ID", runId: "" });
    dispatch({ type: "RESET_ACTIVE_CONVERSATION" });
    window.dispatchEvent(new CustomEvent("agent:reset-event-cache"));
    window.dispatchEvent(new CustomEvent("agent:voice-reset"));
  };
  const handleDelete = (chat: WorkerConversationRow) => {
    if (!chat || !chat?.chatId || pending) return;
    modal.confirm({
      title: t("chatActions.delete.title"),
      content: getHistoryTitle(chat),
      okText: t("chatActions.delete.ok"),
      okButtonProps: { danger: true },
      cancelText: t("chatActions.cancel"),
      onOk: async () => {
        setPending(true);
        try {
          await deleteChat({ chatId: chat.chatId });
          dispatch({ type: "CHAT_DELETED", chatId: chat.chatId });
          onChatDeleted?.(chat.chatId);
          clearActiveChatIfNeeded(chat.chatId);
        } catch (error) {
          dispatch({
            type: "APPEND_DEBUG",
            line: `[delete chat error] ${(error as Error).message}`,
          });
          throw error;
        } finally {
          setPending(false);
        }
      },
    });
  };
  return (
    <div className="command-modal-section">
      <div className="command-history-toolbar">
        <Input
          ref={inputRef}
          prefix={
            <MaterialIcon
              name="search"
              style={{ color: "var(--text-muted)" }}
            />
          }
          variant="filled"
          placeholder={t("history.searchPlaceholder")}
          value={historySearch}
          onChange={(event) => onHistorySearchChange(event.target.value)}
        />
        {unreadCount > 0 && onMarkAllRead && (
          <div className="command-history-toolbar-actions">
            <UiButton
              className="command-history-action"
              variant="ghost"
              size="sm"
              onClick={onMarkAllRead}
            >
              {t("history.markAllRead")}
            </UiButton>
          </div>
        )}
      </div>
      {historyLoading ? (
        <div className="command-empty-state">{t("history.loading")}</div>
      ) : historyError ? (
        <div className="command-empty-state">{historyError}</div>
      ) : historyRows.length === 0 ? (
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
            return (
              <UiListItem
                ref={(element) => {
                  historyItemRefs.current[index] = element;
                }}
                key={chat.chatId}
                className={`command-list-item ${index === historyIndex ? "is-active" : ""}`}
                selected={index === historyIndex}
                role="option"
                aria-selected={index === historyIndex}
                onClick={() => onSelect(index)}
              >
                <Flex
                  justify="space-between"
                  align="center"
                  gap={10}
                  style={{ height: 28 }}
                >
                  <Flex align="center" gap={6} style={{ overflow: "hidden" }}>
                    <span className="history-list-title">{historyTitle}</span>
                    {isChatUnread(chat) ? <Tag color="blue">{t("history.unread")}</Tag> : null}
                  </Flex>
                  <Flex align="center" className="history-list-actions">
                    <span className="history-list-action-time">
                      {formatChatTimeLabel(chat.updatedAt)}
                    </span>
                    <Tooltip title={t("history.action.export")}>
                      <UiButton
                        size="sm"
                        variant="ghost"
                        iconOnly
                        loading={pending}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExport?.(chat.chatId);
                        }}
                      >
                        <MaterialIcon
                          name="export"
                          style={{ color: "var(--accent)" }}
                        />
                      </UiButton>
                    </Tooltip>
                    <Tooltip title={t("history.action.archive")}>
                      <UiButton
                        size="sm"
                        variant="ghost"
                        iconOnly
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchive?.(chat);
                        }}
                      >
                        <MaterialIcon name="inventory_2" />
                      </UiButton>
                    </Tooltip>
                    <Tooltip title={t("history.action.delete")}>
                      <UiButton
                        size="sm"
                        variant="ghost"
                        iconOnly
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete?.(chat);
                        }}
                      >
                        <MaterialIcon
                          name="delete"
                          style={{ color: "var(--accent-danger)" }}
                        />
                      </UiButton>
                    </Tooltip>
                  </Flex>
                </Flex>
                <div className="command-list-preview">
                  {chat.searchSnippet || chat.lastRunContent || t("history.noPreview")}
                </div>
              </UiListItem>
            );
          })}
        </div>
      )}
    </div>
  );
};
