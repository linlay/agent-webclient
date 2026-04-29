import React, { useMemo } from "react";
import { UiListItem } from "@/shared/ui/UiListItem";
import { useI18n } from "@/shared/i18n";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import type { WorkerConversationRow } from "@/app/state/types";
import { UnreadDot } from "./UnreadDot";
import { ChatActionsMenu } from "./ChatActionsMenu";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
import { LoadingOutlined } from "@ant-design/icons";
import { Spin } from "antd";

export const WorkerChatPreviewItem: React.FC<{
  chat: WorkerConversationRow;
  isActive: boolean;
  loading: boolean;
  onClick: () => void;
}> = ({ chat, isActive, loading, onClick }) => {
  const { t } = useI18n();
  const isUnread = isChatUnread(chat);
  const action = useMemo(() => {
    if (loading) {
      return "loading";
    }
    if (isUnread) {
      return "unread";
    }
    return "time";
  }, [loading, isUnread]);
  return (
    <UiListItem
      className={`worker-chat-item ${isActive ? "is-active" : ""}`}
      selected={isActive}
      onClick={onClick}
    >
      <div className="worker-chat-item-head">
        <span className="worker-chat-name">
          {chat.lastRunContent || chat.chatName || t("leftSidebar.noPreview")}
        </span>
        {chat.hasPendingAwaiting && (
          <span className="chat-awaiting-status">
            {t("leftSidebar.awaitingApproval")}
          </span>
        )}
        {/* 显示优先级：hover > loading > unread > time */}
        <div data-action={action}>
          <Spin
            indicator={<LoadingOutlined />}
            size="small"
            className="worker-chat-loading"
          />
          <UnreadDot chat={chat} />
          <span className="worker-panel-time-label">
            {formatChatTimeLabel(chat.updatedAt)}
          </span>
          <ChatActionsMenu chatId={chat.chatId} chatName={chat.chatName} />
        </div>
      </div>
    </UiListItem>
  );
};
