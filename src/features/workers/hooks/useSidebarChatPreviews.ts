import { useCallback, useEffect, useRef, useState } from "react";
import { useAppContext } from "@/app/state/AppContext";
import { getChats, type GetChatsOptions } from "@/shared/data";
import type { Chat } from "@/features/chats/lib/chatState";
import { mergeFetchedChats } from "@/features/chats/lib/chatSummary";
import { GENERAL_CHAT_LIMIT, GENERAL_CHAT_MAX, PROJECT_CHAT_LIMIT, PROJECT_CHAT_MAX } from "../lib/sidebarNavigation";

export function useSidebarChatPreviews(enabled: boolean, catalogKey: string, initialGeneral = true) {
  const { stateRef, dispatch } = useAppContext();
  const [limits, setLimits] = useState<Record<string, number>>({ general: GENERAL_CHAT_LIMIT });
  const [fetchedIds, setFetchedIds] = useState<string[]>([]);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [moreAvailable, setMoreAvailable] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const requests = useRef(new Map<string, number>());
  const requestedLimits = useRef(new Map<string, number>());
  const generation = useRef(0);
  const load = useCallback(async (key: string, visible: number) => {
    const request = (requests.current.get(key) || 0) + 1;
    requests.current.set(key, request);
    requestedLimits.current.set(key, visible);
    const epoch = generation.current;
    setPending(value => ({ ...value, [key]: true }));
    setErrors(value => ({ ...value, [key]: "" }));
    try {
      const options: GetChatsOptions = key === "general" ? { hasWorkspace: false } : { agentKey: key.slice("agent:".length) };
      const response = await getChats({ ...options, pinned: false, limit: visible + 1 });
      if (epoch !== generation.current || requests.current.get(key) !== request) return;
      const fetched = Array.isArray(response.data) ? response.data as Chat[] : [];
      // Pin projection remains authoritative while a preview request is in flight.
      const pinnedOrder = stateRef.current.chatPinnedOrder;
      const pins = new Set(pinnedOrder);
      const rows = fetched.map(chat => pinnedOrder ? { ...chat, pinned: pins.has(chat.chatId) } : chat);
      dispatch({ type: "SET_CHATS", chats: mergeFetchedChats(stateRef.current.chats, rows) });
      if (key === "general") setFetchedIds(rows.map(chat => chat.chatId));
      setLimits(value => ({ ...value, [key]: visible }));
      setMoreAvailable(value => ({ ...value, [key]: rows.filter(chat => !chat.pinned).length > visible }));
    } catch (cause) {
      if (epoch !== generation.current || requests.current.get(key) !== request) return;
      setErrors(value => ({ ...value, [key]: String(cause instanceof Error ? cause.message : cause) }));
    } finally {
      if (epoch === generation.current && requests.current.get(key) === request) setPending(value => ({ ...value, [key]: false }));
    }
  }, [dispatch, stateRef]);
  useEffect(() => {
    generation.current += 1;
    requests.current.clear();
    requestedLimits.current.clear();
    setLimits({ general: GENERAL_CHAT_LIMIT });
    setFetchedIds([]);
    setMoreAvailable({});
    setPending({});
    setErrors({});
    if (!enabled || !catalogKey) return;
    if (initialGeneral) void load("general", GENERAL_CHAT_LIMIT);
    const refresh = () => {
      if (initialGeneral) void load("general", GENERAL_CHAT_LIMIT);
      for (const key of requests.current.keys()) {
        if (key !== "general") void load(key, PROJECT_CHAT_LIMIT);
      }
    };
    window.addEventListener("agent:refresh-worker-data", refresh);
    return () => { generation.current += 1; window.removeEventListener("agent:refresh-worker-data", refresh); };
  }, [enabled, catalogKey, initialGeneral, load]);
  const showMore = (key: string) => {
    if (pending[key]) return;
    const general = key === "general";
    void load(key, Math.min((limits[key] || (general ? GENERAL_CHAT_LIMIT : PROJECT_CHAT_LIMIT)) + (general ? GENERAL_CHAT_LIMIT : PROJECT_CHAT_LIMIT), general ? GENERAL_CHAT_MAX : PROJECT_CHAT_MAX));
  };
  return { limits, fetchedIds, pending, moreAvailable, errors, showMore, retry: (key: string) => void load(key, requestedLimits.current.get(key) || limits[key] || (key === "general" ? GENERAL_CHAT_LIMIT : PROJECT_CHAT_LIMIT)) };
}
