import { useMemo } from "react";
import type { AppState, WorkerConversationRow } from "@/app/state/types";
import { buildWorkerConversationRows } from "@/features/workers/lib/workerConversationFormatter";
import { createWorkerKeyFromChat } from "@/features/workers/lib/workerListFormatter";
import { resolveWorkerUnreadCount } from "@/features/chats/lib/chatReadState";

type AgentIconConfig = {
  color?: string;
  name?: string;
};

export function useLeftSidebarData({
  agents,
  chatFilter,
  chats,
  historySearch,
  historyWorkerKey,
  teams,
  workerRows,
}: Pick<
  AppState,
  "agents" | "chatFilter" | "chats" | "teams" | "workerRows"
> & {
  historySearch: string;
  historyWorkerKey: string;
}) {
  const filteredChats = useMemo(() => {
    const filter = chatFilter.toLowerCase().trim();
    if (!filter) return chats;
    return chats.filter((chat) => {
      const name = (chat.chatName || "").toLowerCase();
      const id = (chat.chatId || "").toLowerCase();
      return name.includes(filter) || id.includes(filter);
    });
  }, [chats, chatFilter]);

  const workerBaseOrderByKey = useMemo(
    () => new Map(workerRows.map((row, index) => [row.key, index])),
    [workerRows],
  );

  const workerChatOrderByKey = useMemo(() => {
    const sortedChats = chats.slice().sort((a, b) => {
      const updatedA = Number(a?.updatedAt);
      const updatedB = Number(b?.updatedAt);
      const normalizedA = Number.isFinite(updatedA) ? updatedA : 0;
      const normalizedB = Number.isFinite(updatedB) ? updatedB : 0;

      if (normalizedA !== normalizedB) return normalizedB - normalizedA;

      const chatIdA = String(a?.chatId || "");
      const chatIdB = String(b?.chatId || "");
      return chatIdA.localeCompare(chatIdB);
    });

    const orderByKey = new Map<string, number>();
    sortedChats.forEach((chat) => {
      const workerKey = createWorkerKeyFromChat(chat);
      if (!workerKey || orderByKey.has(workerKey)) return;
      orderByKey.set(workerKey, orderByKey.size);
    });

    return orderByKey;
  }, [chats]);

  const filteredWorkerRows = useMemo(() => {
    const filter = chatFilter.toLowerCase().trim();
    const rows = !filter
      ? workerRows
      : workerRows.filter((row) => String(row.searchText || "").includes(filter));

    return rows.slice().sort((a, b) => {
      const chatOrderA = workerChatOrderByKey.get(a.key);
      const chatOrderB = workerChatOrderByKey.get(b.key);
      const hasChatsA = chatOrderA !== undefined;
      const hasChatsB = chatOrderB !== undefined;

      if (hasChatsA && hasChatsB) return chatOrderA - chatOrderB;
      if (hasChatsA !== hasChatsB) return hasChatsA ? -1 : 1;

      return (
        (workerBaseOrderByKey.get(a.key) ?? Number.MAX_SAFE_INTEGER) -
        (workerBaseOrderByKey.get(b.key) ?? Number.MAX_SAFE_INTEGER)
      );
    });
  }, [workerRows, chatFilter, workerBaseOrderByKey, workerChatOrderByKey]);

  const workerIconsByKey = useMemo(() => {
    const icons = new Map<string, AgentIconConfig>();
    for (const agent of agents) {
      if (!agent?.key || !agent.icon) continue;
      icons.set(`agent:${agent.key}`, agent.icon);
    }
    for (const team of teams) {
      if (!team?.teamId || !team.icon) continue;
      icons.set(`team:${team.teamId}`, team.icon);
    }
    return icons;
  }, [agents, teams]);

  const workerChatsByKey = useMemo(() => {
    const chatsByKey = new Map<string, WorkerConversationRow[]>();
    for (const row of workerRows) {
      chatsByKey.set(
        row.key,
        buildWorkerConversationRows({
          chats,
          worker: row,
        }),
      );
    }
    return chatsByKey;
  }, [chats, workerRows]);

  const workerUnreadCountByKey = useMemo(() => {
    const unreadCounts = new Map<string, number>();
    for (const row of workerRows) {
      unreadCounts.set(row.key, resolveWorkerUnreadCount(row, agents, chats));
    }
    return unreadCounts;
  }, [agents, chats, workerRows]);

  const historyRows = useMemo(
    () => workerChatsByKey.get(historyWorkerKey) || [],
    [historyWorkerKey, workerChatsByKey],
  );

  const filteredHistoryRows = useMemo(() => {
    const search = historySearch.trim().toLowerCase();
    if (!search) return historyRows;
    return historyRows.filter((row) => {
      const haystack = [row.chatName, row.chatId, row.lastRunContent]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [historyRows, historySearch]);

  return {
    filteredChats,
    filteredWorkerRows,
    workerBaseOrderByKey,
    workerChatOrderByKey,
    workerIconsByKey,
    workerChatsByKey,
    workerUnreadCountByKey,
    historyRows,
    filteredHistoryRows,
  };
}

