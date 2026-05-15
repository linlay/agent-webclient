import React from "react";
import { Flex, Input, Tag, Tooltip } from "antd";
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
                    <UiButton size="sm" variant="ghost" iconOnly>
                      <MaterialIcon
                        name="download"
                        style={{ color: "var(--accent)" }}
                      />
                    </UiButton>
                  </Tooltip>
                  <Tooltip title="归档">
                    <UiButton size="sm" variant="ghost" iconOnly>
                      <MaterialIcon name="inventory_2" />
                    </UiButton>
                  </Tooltip>
                  <Tooltip title="删除">
                    <UiButton size="sm" variant="ghost" iconOnly>
                      <MaterialIcon
                        name="delete"
                        style={{ color: "var(--accent-danger)" }}
                      />
                    </UiButton>
                  </Tooltip>
                  {/* <ChatActionsMenu
                    chatId={chat.chatId}
                    chatName={chat.chatName || chat.chatId}
                    onArchived={onChatDeleted}
                    onDeleted={onChatDeleted}
                  /> */}
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
