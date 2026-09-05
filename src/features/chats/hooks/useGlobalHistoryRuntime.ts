import React from "react";
import type { Dayjs } from "dayjs";
import type { Agent, Chat, Team, WorkerListItem } from "@/app/state/types";
import { getAgents, getChats } from "@/shared/data";
import {
  ALL_HISTORY_OWNERS,
  buildGlobalHistoryOwnerOptions,
  filterGlobalHistoryChats,
  type HistoryOwnerKey,
} from "@/features/chats/lib/globalHistory";
import { resolveLoadedHistoryOwnerKey } from "@/features/chats/lib/historyRoute";

export type HistoryDateRange = [Dayjs | null, Dayjs | null] | null;

export function useGlobalHistoryRuntime(initialOwnerKey: HistoryOwnerKey) {
  const [query, setQuery] = React.useState("");
  const [ownerKey, setOwnerKey] = React.useState<HistoryOwnerKey>(initialOwnerKey);
  const [dateRange, setDateRange] = React.useState<HistoryDateRange>(null);
  const [chats, setChats] = React.useState<Chat[]>([]);
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [teams, setTeams] = React.useState<Team[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [ownersLoaded, setOwnersLoaded] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let disposed = false;
    setLoading(true);
    setOwnersLoaded(false);
    setError("");
    void getChats()
      .then((response) => {
        if (!disposed) setChats(Array.isArray(response.data) ? response.data as Chat[] : []);
      })
      .catch((cause: unknown) => {
        if (!disposed) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    void getAgents({ includeTeam: true, scope: "nav" })
      .then((response) => {
        if (disposed) return;
        const items = Array.isArray(response.data) ? response.data as WorkerListItem[] : [];
        setAgents(items.filter((item): item is Agent =>
          Boolean(item && typeof item === "object" && "key" in item && String(item.key || "").trim()),
        ));
        setTeams(items.filter((item): item is Team =>
          Boolean(item && typeof item === "object" && "teamId" in item && String(item.teamId || "").trim()),
        ));
      })
      .catch(() => {
        if (!disposed) {
          setAgents([]);
          setTeams([]);
        }
      })
      .finally(() => {
        if (!disposed) setOwnersLoaded(true);
      });
    return () => {
      disposed = true;
    };
  }, []);

  const ownerOptions = React.useMemo(
    () => buildGlobalHistoryOwnerOptions({ agents, chats, teams }),
    [agents, chats, teams],
  );
  React.useEffect(() => {
    const resolved = resolveLoadedHistoryOwnerKey({
      ownerKey,
      ownerOptions,
      loading: loading || !ownersLoaded,
    });
    if (resolved !== ownerKey) setOwnerKey(resolved);
  }, [loading, ownerKey, ownerOptions, ownersLoaded]);

  const startAt = dateRange?.[0]?.startOf("day").valueOf();
  const endAt = dateRange?.[1]?.endOf("day").valueOf();
  const rows = React.useMemo(
    () => filterGlobalHistoryChats(chats, { query, ownerKey, startAt, endAt }),
    [chats, endAt, ownerKey, query, startAt],
  );
  const hasFilters = Boolean(query.trim() || ownerKey !== ALL_HISTORY_OWNERS || dateRange);
  const resetFilters = React.useCallback(() => {
    setQuery("");
    setOwnerKey(ALL_HISTORY_OWNERS);
    setDateRange(null);
  }, []);

  return {
    chats,
    dateRange,
    error,
    hasFilters,
    loading,
    ownerKey,
    ownerOptions,
    query,
    resetFilters,
    rows,
    setDateRange,
    setOwnerKey,
    setQuery,
  };
}
