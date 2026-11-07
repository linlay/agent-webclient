import { useEffect, useState } from "react";
import { getChat } from "@/shared/data/api/requests/chats";
import type { ChatDetailResponse } from "@/shared/data/api/dto/chats";
import type { MailRecord } from "@/shared/data/api/dto/mailbox";

export function useMailTargetChats(rows: MailRecord[]) {
  const [chats, setChats] = useState<Record<string, ChatDetailResponse | null>>({});
  useEffect(() => {
    let disposed = false;
    setChats({});
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || disposed) return;
      refreshing = true;
      await Promise.all([...new Set(rows.flatMap(mail => [mail.fromChatId, mail.toChatId]).filter(Boolean))].map(async chatId => {
        try {
          const response = await getChat(chatId);
          if (!disposed) setChats(current => ({ ...current, [chatId]: response.data }));
        } catch {
          if (!disposed) setChats(current => ({ ...current, [chatId]: null }));
        }
      }));
      refreshing = false;
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [rows]);
  return chats;
}
