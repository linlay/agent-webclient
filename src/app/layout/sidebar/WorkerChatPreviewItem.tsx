import React from "react";
import { UiListItem } from "@/shared/ui/UiListItem";
import { useI18n } from "@/shared/i18n";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import type { WorkerConversationRow } from "@/app/state/types";
import { UnreadDot } from "./UnreadDot";
import { ChatActionsMenu } from "./ChatActionsMenu";

export const WorkerChatPreviewItem: React.FC<{
  chat: WorkerConversationRow;
  isActive: boolean;
  loading: boolean;
  onClick: () => void;
}> = ({ chat, isActive, loading, onClick }) => {
  const { t } = useI18n();
  return (
    <UiListItem
      className={`worker-chat-item ${isActive ? "is-active" : ""}`}
      selected={isActive}
      loading={loading}
      onClick={onClick}
    >
      <div className="worker-chat-item-head">
        <UnreadDot chat={chat} />
        <span className="worker-chat-name">
          {chat.lastRunContent || chat.chatName || t("leftSidebar.noPreview")}
        </span>
        {chat.hasPendingAwaiting && (
          <span className="chat-awaiting-status">
            {t("leftSidebar.awaitingApproval")}
          </span>
        )}
        <span className="worker-panel-time-label">
          {formatChatTimeLabel(chat.updatedAt)}
        </span>
        <ChatActionsMenu chatId={chat.chatId} chatName={chat.chatName} />
      </div>
    </UiListItem>
  );
};
