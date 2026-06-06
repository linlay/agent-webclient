import React from "react";
import { UiListItem } from "@/shared/ui/UiListItem";
import { useI18n } from "@/shared/i18n";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import type { WorkerConversationRow } from "@/app/state/types";
import { UnreadDot } from "./UnreadDot";
import { ChatActionsMenu } from "./ChatActionsMenu";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

function getAwaitingStatusKey(mode?: string): string {
  switch (mode) {
    case 'plan': return 'leftSidebar.awaitingStatus.plan';
    case 'question': return 'leftSidebar.awaitingStatus.question';
    case 'approval': return 'leftSidebar.awaitingStatus.approval';
    case 'form': return 'leftSidebar.awaitingStatus.form';
    default: return 'leftSidebar.awaitingApproval';
  }
}

export const WorkerChatPreviewItem: React.FC<{
  chat: WorkerConversationRow;
  isActive: boolean;
  loading: boolean;
  onClick: () => void;
}> = ({ chat, isActive, loading, onClick }) => {
  const { t } = useI18n();
  const action = chat.hasPendingAwaiting ? "awaiting" : loading ? "loading" : "time";

  return (
    <UiListItem
      className={`worker-chat-item ${isActive ? "is-active" : ""}`}
      selected={isActive}
      onClick={onClick}
    >
      <div className="worker-chat-item-head">
        <UnreadDot chat={chat} />
        <span className="worker-chat-name">
          {chat.lastRunContent || chat.chatName || t("leftSidebar.noPreview")}
        </span>
        {/* 显示优先级：hover > awaiting > loading > time */}
        <span className="worker-chat-action" data-action={action}>
          {chat.hasPendingAwaiting && (
            <span className="chat-awaiting-status">
              {t(getAwaitingStatusKey(chat.awaitingMode))}
            </span>
          )}
          <MaterialIcon
            name="progress_activity"
            className="worker-chat-loading"
          />
          <span className="worker-panel-time-label">
            {formatChatTimeLabel(chat.updatedAt)}
          </span>
          <ChatActionsMenu chatId={chat.chatId} chatName={chat.chatName} />
        </span>
      </div>
    </UiListItem>
  );
};
