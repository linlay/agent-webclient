import React from "react";
import { Button, Tooltip } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { AgentIcon } from "@/shared/icons/agent";
import { useI18n } from "@/shared/i18n";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
import type { WorkerConversationRow, WorkerRow } from "@/app/state/types";
import { WorkerChatPreviewItem } from "./WorkerChatPreviewItem";

type AgentIconConfig = {
  color?: string;
  name?: string;
};

export const WorkerConversationPreviewList: React.FC<{
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
  onMarkAllRead?: (
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
  onMarkAllRead,
}) => {
  const { t } = useI18n();
  const recentChats = chats.slice(0, 5);
  const unreadCount = chats.reduce(
    (count, chat) => count + (isChatUnread(chat) ? 1 : 0),
    0,
  );
  const unreadSuffix =
    unreadCount > 0
      ? t("leftSidebar.showMoreUnreadSuffix", { count: unreadCount })
      : "";

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
          <Tooltip title={t("leftSidebar.newConversation")}>
            <Button
              className="worker-panel-new worker-popover-new"
              type="text"
              icon={<MaterialIcon name="add" />}
              onClick={(e) => onStartNewConversation(e, row.key)}
            />
          </Tooltip>
          {row.type === "agent" && unreadCount > 0 && onMarkAllRead && (
            <Tooltip title={t("leftSidebar.markAllRead")}>
              <Button
                className="worker-panel-new worker-popover-new"
                type="text"
                icon={<MaterialIcon name="done_all" />}
                onClick={(e) => onMarkAllRead(e, row.key)}
              />
            </Tooltip>
          )}
        </div>
      )}
      <div className="worker-chat-divider"></div>
      {recentChats.length === 0 ? (
        <div className="status-line">
          {t("leftSidebar.noRelatedConversations")}
        </div>
      ) : (
        recentChats.map((chat) => (
          <WorkerChatPreviewItem
            key={chat.chatId}
            chat={chat}
            isActive={chat.chatId === activeChatId}
            loading={getWorkerChatLoading(chat.chatId)}
            onClick={() => onSelectChat(chat.chatId)}
          />
        ))
      )}
      {chats.length > 5 && (
        <div
          className="worker-chat-more"
          onClick={(e) => onOpenHistory(e, row.key)}
        >
          {t("leftSidebar.showMore", {
            count: chats.length,
            unreadSuffix,
          })}
        </div>
      )}
    </div>
  );
};
