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
      className={["chat-unread-dot", isUnread ? "is-unread" : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={t("leftSidebar.unread")}
    />
  );
};

