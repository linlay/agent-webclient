import React, { useEffect, useRef, useState } from "react";
import { getOpenedChats } from "@/shared/data/api/requests/chats";
import type { ChatSummaryResponse } from "@/shared/data/api/dto/chats";
import { readMailUpdate } from "@/features/mailbox/lib/mailUpdates";
import { useI18n } from "@/shared/i18n";

export function needsOpenedChatAttention(row: ChatSummaryResponse): boolean {
  return Boolean(row.awaiting && row.awaiting.mode !== "wait");
}

export function OpenedChats({ agentKey, onSelectChat }: {
  agentKey: string;
  onSelectChat: (id: string) => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ChatSummaryResponse[]>([]);
  const [error, setError] = useState("");
  const ids = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    let sequence = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const current = ++sequence;
      try {
        const response = await getOpenedChats(agentKey, controller.signal);
        if (current !== sequence || controller.signal.aborted) return;
        ids.current = new Set(response.data.map(row => row.chatId));
        setRows(response.data);
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted) setError(String(cause));
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void refresh(); }, 100);
    };
    const onMail = (event: Event) => {
      const update = readMailUpdate(event);
      if (update && (update.fromAgentKey === agentKey || update.toAgentKey === agentKey ||
          ids.current.has(update.toChatId || "") || ids.current.has(update.fromChatId || ""))) schedule();
    };
    const onChat = (event: Event) => {
      const chatId = (event as CustomEvent<{chatId?: string}>).detail?.chatId;
      if (chatId && ids.current.has(chatId)) schedule();
    };
    void refresh();
    window.addEventListener("agent:mail-updated", onMail);
    window.addEventListener("agent:chat-runtime-updated", onChat);
    return () => {
      ++sequence;
      controller.abort();
      if (timer) clearTimeout(timer);
      window.removeEventListener("agent:mail-updated", onMail);
      window.removeEventListener("agent:chat-runtime-updated", onChat);
    };
  }, [agentKey]);

  return <div>
    {error && <span role="alert">{error}</span>}
    {rows.map(row => {
      const attention = needsOpenedChatAttention(row);
      const label = attention ? "leftSidebar.navigation.primaryAwaiting" :
        row.activeRun ? "leftSidebar.navigation.primaryRunning" : "mailbox.idle";
      return <button type="button" key={row.chatId} onClick={() => onSelectChat(row.chatId)}
        className={`tw:ml-6 tw:block tw:text-left ${attention ? "tw:text-accent" : "tw:text-ink-2"}`}>
        {row.chatName} · {t(label)}
      </button>;
    })}
  </div>;
}
