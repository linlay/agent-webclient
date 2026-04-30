import React from "react";
import { Flex, Input } from "antd";
import type { WorkerConversationRow } from "@/app/state/types";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiListItem } from "@/shared/ui/UiListItem";
import { ChatActionsMenu } from "@/app/layout/sidebar/ChatActionsMenu";
import { UiButton } from "@/shared/ui/UiButton";

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
  const unreadCount = historyRows.reduce(
    (count, chat) => count + (isChatUnread(chat) ? 1 : 0),
    0,
  );

  return (
    <div className="command-modal-section">
      {unreadCount > 0 && onMarkAllRead && (
        <UiButton
          className="command-history-action"
          variant="ghost"
          size="sm"
          onClick={onMarkAllRead}
        >
          一键已读
        </UiButton>
      )}
      <div className="command-history-toolbar">
        <Input
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
              <Flex justify="space-between" align="center" gap={10}>
                <Flex align="center" gap={6}>
                  {isChatUnread(chat) ? (
                    <span className="chat-unread-dot is-unread" />
                  ) : null}
                  <span>{chat.chatName || chat.chatId}</span>
                </Flex>
                <Flex align="center" gap={10} className="history-list-actions">
                  <span className="history-list-action-time">
                    {formatChatTimeLabel(chat.updatedAt)}
                  </span>
                  <ChatActionsMenu
                    chatId={chat.chatId}
                    chatName={chat.chatName || chat.chatId}
                    onArchived={onChatDeleted}
                    onDeleted={onChatDeleted}
                  />
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
