import { useEffect, useState } from "react";
import { getChats } from "@/shared/data/api/requests/chats";
import type { ChatSummaryResponse } from "@/shared/data/api/dto/chats";
import type { MailRecord } from "@/shared/data/api/dto/mailbox";

export function buildMailChatLabels(items: ChatSummaryResponse[]): Record<string, string> {
  const chats = items.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.chatId.localeCompare(b.chatId));
  let work = 0;
  const labels: Record<string, string> = {};
  for (const chat of chats) {
    if (chat.primary === true) labels[chat.chatId] = "Primary";
    else if (chat.primary === false) labels[chat.chatId] = `Work #${++work}`;
  }
  return labels;
}

export function useMailChatLabels(rows: MailRecord[]) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const agentKeys = JSON.stringify([...new Set(rows.flatMap(mail => [mail.fromAgentKey, mail.toAgentKey]).filter(Boolean))].sort());
  useEffect(() => {
    let disposed = false;
    setLabels({});
    for (const agentKey of JSON.parse(agentKeys) as string[]) {
      void getChats({ agentKey }).then(response => {
        const next = buildMailChatLabels(Array.isArray(response.data) ? response.data as ChatSummaryResponse[] : []);
        if (!disposed) setLabels(current => ({ ...current, ...next }));
      }).catch(() => { /* Keep unknown identity explicit when the directory is unavailable. */ });
    }
    return () => { disposed = true; };
  }, [agentKeys]);
  return labels;
}
