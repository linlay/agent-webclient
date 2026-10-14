import { useCallback, useEffect, useRef, useState } from "react";
import { getChats, searchGlobal } from "@/shared/data";
import {
  CHAT_REFERENCE_LIMIT,
  CHAT_REFERENCE_SEARCH_LIMIT,
  normalizeChatReferenceCandidates,
  type ChatReferenceCandidate,
} from "../lib/chatReferenceCandidates";

interface CandidateSnapshot {
  scope: string;
  query: string;
  chats: ChatReferenceCandidate[];
  loading: boolean;
  error: boolean;
}

interface ChatReferenceCandidatesOptions {
  enabled: boolean;
  agentKey: string;
  currentChatId: string;
  query: string;
  composing?: boolean;
}

export function useChatReferenceCandidates({
  enabled,
  agentKey: rawAgentKey,
  currentChatId: rawCurrentChatId,
  query: rawQuery,
  composing = false,
}: ChatReferenceCandidatesOptions) {
  const agentKey = rawAgentKey.trim();
  const currentChatId = rawCurrentChatId.trim();
  const query = rawQuery.trim();
  const scope = JSON.stringify([agentKey, currentChatId]);
  const [snapshot, setSnapshot] = useState<CandidateSnapshot | null>(null);
  const preview = useRef<CandidateSnapshot | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      preview.current = null;
      setSnapshot(null);
      return;
    }
    if (preview.current?.scope !== scope) preview.current = null;
    if (composing) return;
    if (!query && preview.current) {
      setSnapshot(preview.current);
      return;
    }

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setSnapshot({ scope, query, chats: [], loading: true, error: false });
    const load = async () => {
      try {
        const data = query
          ? (await searchGlobal({ query, agentKey, limit: CHAT_REFERENCE_SEARCH_LIMIT })).data.results
          : (await getChats({ agentKey, limit: CHAT_REFERENCE_LIMIT + 1 })).data;
        if (disposed) return;
        const next: CandidateSnapshot = {
          scope,
          query,
          chats: normalizeChatReferenceCandidates(data, currentChatId),
          loading: false,
          error: false,
        };
        if (!query) preview.current = next;
        setSnapshot(next);
      } catch {
        if (!disposed) {
          setSnapshot({ scope, query, chats: [], loading: false, error: true });
        }
      }
    };
    if (query) timer = setTimeout(() => void load(), 250);
    else void load();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [enabled, agentKey, currentChatId, scope, query, composing, attempt]);

  // Match the current identity during render, before the next effect runs.
  const visible = enabled && !composing
    ? (!query && preview.current?.scope === scope ? preview.current
      : snapshot?.scope === scope && snapshot.query === query ? snapshot : null)
    : null;
  return {
    chats: visible?.chats || [],
    loading: enabled && (composing || !visible || visible.loading),
    error: visible?.error || false,
    searching: Boolean(query),
    retry,
  };
}
