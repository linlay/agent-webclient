import React, { useEffect, useRef, useState } from "react";
import { Flex, Input, InputRef, Tag, Tooltip } from "antd";
import type { WorkerConversationRow } from "@/app/state/types";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiListItem } from "@/shared/ui/UiListItem";
import { UiButton } from "@/shared/ui/UiButton";
import useApp from "antd/es/app/useApp";
import { t } from "@/shared/i18n";
import {
  archiveChats,
  deleteChat,
  downloadChatExport,
} from "@/features/transport/lib/apiClientProxy";
import { useAppContext } from "../state/provider";

export const HistoryModal: React.FC<{
  historyRows: WorkerConversationRow[];
  historyIndex: number;
  historySearch: string;
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
  const [pending, setPending] = useState(false);
  const unreadCount = historyRows.reduce(
    (count, chat) => count + (isChatUnread(chat) ? 1 : 0),
    0,
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const handleExport = async (chatId: string) => {
    if (!chatId || pending) return;
    setPending(true);
    try {
      await downloadChatExport(chatId);
      message.success("已导出到下载目录");
    } catch (error) {
      message.error("导出失败");
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
      content: chat.chatName || chat.chatId,
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
      content: chat.chatName || chat.chatId,
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
          placeholder="搜索标题或预览..."
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
              一键已读
            </UiButton>
          </div>
        )}
      </div>
      {historyRows.length === 0 ? (
        <div className="command-empty-state">当前对象暂无匹配历史对话。</div>
      ) : (
        <div
          ref={historyListRef}
          className="command-modal-list command-modal-list-focusable history-list-container"
          tabIndex={0}
          role="listbox"
          aria-label="历史对话"
        >
          {historyRows.map((chat, index) => (
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
                  <span className="history-list-title">
                    {chat.chatName || chat.chatId}
                  </span>
                  {isChatUnread(chat) ? <Tag color="blue">未读</Tag> : null}
                </Flex>
                <Flex align="center" className="history-list-actions">
                  <span className="history-list-action-time">
                    {formatChatTimeLabel(chat.updatedAt)}
                  </span>
                  <Tooltip title="导出">
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
                        name="download"
                        style={{ color: "var(--accent)" }}
                      />
                    </UiButton>
                  </Tooltip>
                  <Tooltip title="归档">
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
                  <Tooltip title="删除">
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
                {chat.searchSnippet || chat.lastRunContent || "(无预览)"}
              </div>
            </UiListItem>
          ))}
        </div>
      )}
    </div>
  );
};
