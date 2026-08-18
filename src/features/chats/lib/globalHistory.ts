import type { Agent, Chat, Team } from "@/app/state/types";
import { readEpochMillis } from "@/shared/utils/platformTime";

export const ALL_HISTORY_OWNERS = "all";

export type HistoryOwnerKey =
  | typeof ALL_HISTORY_OWNERS
  | `agent:${string}`
  | `team:${string}`;

export interface HistoryOwnerOption {
  key: Exclude<HistoryOwnerKey, typeof ALL_HISTORY_OWNERS>;
  label: string;
  sourceId: string;
  type: "agent" | "team";
}

export interface GlobalHistoryFilters {
  query?: string;
  ownerKey?: HistoryOwnerKey;
  startAt?: number;
  endAt?: number;
}

function text(value: unknown): string {
  return String(value || "").trim();
}

export function resolveChatHistoryOwnerKey(
  chat: Pick<Chat, "agentKey" | "firstAgentKey" | "teamId">,
): Exclude<HistoryOwnerKey, typeof ALL_HISTORY_OWNERS> | "" {
  const teamId = text(chat?.teamId);
  if (teamId) return `team:${teamId}`;

  const agentKey = text(chat?.agentKey || chat?.firstAgentKey);
  return agentKey ? `agent:${agentKey}` : "";
}

export function buildGlobalHistoryOwnerOptions(input: {
  agents?: Agent[];
  chats?: Chat[];
  teams?: Team[];
}): HistoryOwnerOption[] {
  const options = new Map<HistoryOwnerOption["key"], HistoryOwnerOption>();

  for (const agent of Array.isArray(input.agents) ? input.agents : []) {
    const sourceId = text(agent?.key);
    if (!sourceId) continue;
    options.set(`agent:${sourceId}`, {
      key: `agent:${sourceId}`,
      label: text(agent?.name) || sourceId,
      sourceId,
      type: "agent",
    });
  }

  for (const team of Array.isArray(input.teams) ? input.teams : []) {
    const sourceId = text(team?.teamId);
    if (!sourceId) continue;
    options.set(`team:${sourceId}`, {
      key: `team:${sourceId}`,
      label: text(team?.name) || sourceId,
      sourceId,
      type: "team",
    });
  }

  for (const chat of Array.isArray(input.chats) ? input.chats : []) {
    const ownerKey = resolveChatHistoryOwnerKey(chat);
    if (!ownerKey || options.has(ownerKey)) continue;
    const type = ownerKey.startsWith("team:") ? "team" : "agent";
    const sourceId = ownerKey.slice(type.length + 1);
    options.set(ownerKey, {
      key: ownerKey,
      label:
        type === "agent"
          ? text(chat?.firstAgentName) || sourceId
          : sourceId,
      sourceId,
      type,
    });
  }

  return Array.from(options.values()).sort((left, right) => {
    if (left.type !== right.type) return left.type === "agent" ? -1 : 1;
    const byLabel = left.label.localeCompare(right.label);
    return byLabel || left.sourceId.localeCompare(right.sourceId);
  });
}

export function filterGlobalHistoryChats(
  chats: Chat[],
  filters: GlobalHistoryFilters = {},
): Chat[] {
  const query = text(filters.query).toLowerCase();
  const ownerKey = filters.ownerKey || ALL_HISTORY_OWNERS;
  const hasStart = Number.isFinite(filters.startAt);
  const hasEnd = Number.isFinite(filters.endAt);

  return (Array.isArray(chats) ? chats : [])
    .filter((chat) => {
      if (ownerKey !== ALL_HISTORY_OWNERS) {
        if (resolveChatHistoryOwnerKey(chat) !== ownerKey) return false;
      }

      if (query) {
        const haystack = [chat.chatName, chat.chatId, chat.lastRunContent]
          .map(text)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (hasStart || hasEnd) {
        const updatedAt = readEpochMillis(chat.updatedAt);
        if (updatedAt === undefined) return false;
        if (hasStart && updatedAt < Number(filters.startAt)) return false;
        if (hasEnd && updatedAt > Number(filters.endAt)) return false;
      }

      return true;
    })
    .slice()
    .sort((left, right) => {
      const leftUpdatedAt = readEpochMillis(left.updatedAt) ?? 0;
      const rightUpdatedAt = readEpochMillis(right.updatedAt) ?? 0;
      if (leftUpdatedAt !== rightUpdatedAt) {
        return rightUpdatedAt - leftUpdatedAt;
      }
      return text(left.chatId).localeCompare(text(right.chatId));
    });
}
