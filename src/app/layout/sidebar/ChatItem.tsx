import React from "react";
import { UiListItem } from "@/shared/ui/UiListItem";
import { UiTag } from "@/shared/ui/UiTag";
import { useI18n } from "@/shared/i18n";
import {
  formatChatTimeLabel,
  pickChatAgentLabel,
} from "@/features/chats/lib/chatListFormatter";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
import type { Chat } from "@/app/state/types";
import { UnreadDot } from "./UnreadDot";

export const ChatItem: React.FC<{
  chat: Chat;
  agents: Array<{ key?: string; name?: string }>;
  isActive: boolean;
  onClick: () => void;
}> = ({ chat, agents, isActive, onClick }) => {
  const { t } = useI18n();
  const label = pickChatAgentLabel(chat, agents);
  const title = chat.chatName || chat.chatId || t("leftSidebar.titleUntitled");
  const isUnread = isChatUnread(chat);

  return (
    <UiListItem
      className={`chat-item ${isActive ? "is-active" : ""} ${isUnread ? "is-unread" : ""}`}
      selected={isActive}
      dense
      onClick={onClick}
    >
      <div className="chat-item-head">
        <div className="chat-title-wrap">
          <UnreadDot chat={chat} />
          <div className="chat-title">{title}</div>
        </div>
        <span className="worker-panel-time-label">
          {formatChatTimeLabel(chat.updatedAt)}
        </span>
      </div>
      <div className="chat-meta-line">
        <UiTag tone="muted">{label}</UiTag>
      </div>
    </UiListItem>
  );
};

