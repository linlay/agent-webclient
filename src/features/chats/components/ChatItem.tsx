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
import { ChatActionsMenu } from "./ChatActionsMenu";

const CHAT_ITEM_HEAD_CLASS =
  "chat-item-head tw:flex tw:items-center tw:gap-2.5 tw:[&_.chat-unread-dot]:block tw:[&_.chat-unread-dot]:h-2 tw:[&_.chat-unread-dot]:w-2 tw:[&_.chat-unread-dot]:flex-none tw:[&_.chat-unread-dot]:rounded-full tw:[&_.chat-unread-dot]:bg-accent-electric tw:[&_.chat-unread-dot]:opacity-0 tw:[&_.chat-unread-dot.is-unread]:opacity-100 tw:[&_.worker-panel-time-label]:text-[11px] tw:[&_.worker-panel-time-label]:text-text-muted";

const CHAT_TITLE_WRAP_CLASS =
  "chat-title-wrap tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-2";

const CHAT_TITLE_CLASS =
  "chat-title tw:inline-flex tw:items-center tw:gap-1.5 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[13px] tw:font-extrabold tw:text-ink-1";

const CHAT_META_LINE_CLASS =
  "chat-meta-line tw:mt-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-xs tw:text-ink-muted tw:[&_.ui-tag]:max-w-full";

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
      <div className={CHAT_ITEM_HEAD_CLASS}>
        <div className={CHAT_TITLE_WRAP_CLASS}>
          <UnreadDot chat={chat} />
          <div className={CHAT_TITLE_CLASS}>{title}</div>
        </div>
        <span className="worker-panel-time-label">
          {formatChatTimeLabel(chat.updatedAt)}
        </span>
        <ChatActionsMenu chatId={chat.chatId} chatName={title} />
      </div>
      <div className={CHAT_META_LINE_CLASS}>
        <UiTag tone="muted">{label}</UiTag>
      </div>
    </UiListItem>
  );
};
