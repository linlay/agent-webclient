import React from "react";
import { useI18n } from "@/shared/i18n";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
import type { Chat, WorkerConversationRow } from "@/app/state/types";

export const UnreadDot: React.FC<{ chat: Chat | WorkerConversationRow }> = ({
  chat,
}) => {
  const { t } = useI18n();
  const isUnread = isChatUnread(chat);
  return (
    <span
      className={[
        "chat-unread-dot tw:block tw:h-2 tw:w-2 tw:flex-none tw:rounded-full tw:bg-accent-electric",
        isUnread ? "is-unread tw:opacity-100" : "tw:opacity-0",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={t("leftSidebar.unread")}
    />
  );
};
