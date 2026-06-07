import { useMemo } from "react";
import type { AppState, WorkerConversationRow } from "@/app/state/types";
import { buildWorkerConversationRows } from "@/features/workers/lib/workerConversationFormatter";
import { createWorkerKeyFromChat } from "@/features/workers/lib/workerListFormatter";
import { resolveWorkerUnreadCount } from "@/features/chats/lib/chatReadState";

type AgentIconConfig = string | {
  color?: string;
  name?: string;
};

export type WorkerSortMode = "byName" | "byTime";

export function sortWorkerRowsForMode(
  rows: AppState["workerRows"],
  options: {
    agentOrderByKey: Map<string, number>;
    workerBaseOrderByKey: Map<string, number>;
    workerChatOrderByKey: Map<string, number>;
    workerSortMode: WorkerSortMode;
  },
): AppState["workerRows"] {
  if (options.workerSortMode === "byName") {
    return rows.slice().sort((a, b) => {
      const agentOrderA = options.agentOrderByKey.get(a.key);
      const agentOrderB = options.agentOrderByKey.get(b.key);
      const hasAgentOrderA = agentOrderA !== undefined;
      const hasAgentOrderB = agentOrderB !== undefined;

      if (hasAgentOrderA && hasAgentOrderB) return agentOrderA - agentOrderB;
      if (hasAgentOrderA !== hasAgentOrderB) return hasAgentOrderA ? -1 : 1;

      return (
        (options.workerBaseOrderByKey.get(a.key) ?? Number.MAX_SAFE_INTEGER) -
        (options.workerBaseOrderByKey.get(b.key) ?? Number.MAX_SAFE_INTEGER)
      );
    });
  }

  return rows.slice().sort((a, b) => {
    const chatOrderA = options.workerChatOrderByKey.get(a.key);
    const chatOrderB = options.workerChatOrderByKey.get(b.key);
    const hasChatsA = chatOrderA !== undefined;
    const hasChatsB = chatOrderB !== undefined;

    if (hasChatsA && hasChatsB) return chatOrderA - chatOrderB;
    if (hasChatsA !== hasChatsB) return hasChatsA ? -1 : 1;

    return (
      (options.workerBaseOrderByKey.get(a.key) ?? Number.MAX_SAFE_INTEGER) -
      (options.workerBaseOrderByKey.get(b.key) ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

export function useLeftSidebarData({
  agents,
  chatFilter,
  chats,
  historySearch,
  historyWorkerKey,
  teams,
  workerRows,
  workerSortMode = "byTime",
}: Pick<
  AppState,
  "agents" | "chatFilter" | "chats" | "teams" | "workerRows"
> & {
  historySearch: string;
  historyWorkerKey: string;
  workerSortMode?: WorkerSortMode;
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

  const agentOrderByKey = useMemo(
    () =>
      new Map(
        agents
          .map((agent, index) => [`agent:${String(agent?.key || "").trim()}`, index] as const)
          .filter(([key]) => key !== "agent:"),
      ),
    [agents],
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

    return sortWorkerRowsForMode(rows, {
      agentOrderByKey,
      workerBaseOrderByKey,
      workerChatOrderByKey,
      workerSortMode,
    });
  }, [
    agentOrderByKey,
    workerRows,
    chatFilter,
    workerBaseOrderByKey,
    workerChatOrderByKey,
    workerSortMode,
  ]);

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

  const workerTotalCountByKey = useMemo(() => {
    const totalCounts = new Map<string, number>();
    for (const agent of agents) {
      const agentKey = String(agent?.key || "").trim();
      if (!agentKey) continue;
      const totalCount = Number(agent?.stats?.totalCount);
      if (Number.isFinite(totalCount)) {
        totalCounts.set(`agent:${agentKey}`, totalCount);
      }
    }
    for (const row of workerRows) {
      if (totalCounts.has(row.key)) continue;
      totalCounts.set(row.key, workerChatsByKey.get(row.key)?.length || 0);
    }
    return totalCounts;
  }, [agents, workerChatsByKey, workerRows]);

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
    workerTotalCountByKey,
    historyRows,
    filteredHistoryRows,
  };
}
