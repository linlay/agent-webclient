import React from "react";
import type { Chat } from "@/features/chats/lib/chatState";
import { getAgent, getChats, type AgentDetailResponse } from "@/shared/data";

function initialState(agentKey: string) {
  return {
    agentKey,
    agent: null as AgentDetailResponse | null,
    chats: [] as Chat[],
    loading: Boolean(agentKey),
    error: "",
    chatsError: "",
  };
}

export function useProjectAgent(agentKey = "") {
  const key = agentKey.trim();
  const [state, setState] = React.useState(() => initialState(key));

  React.useEffect(() => {
    let disposed = false;
    setState(initialState(key));
    if (!key) return;

    void getAgent(key)
      .then(({ data }) => {
        if (disposed) return;
        const workspace = data.meta?.workspace;
        const root = workspace && typeof workspace === "object" && !Array.isArray(workspace)
          ? (workspace as Record<string, unknown>).root
          : undefined;
        const workspaceDir = String(root ?? data.workspaceDir ?? "").trim();
        setState((current) => ({
          ...current,
          agent: workspaceDir && !workspaceDir.startsWith("@") ? data : null,
          loading: false,
        }));
      })
      .catch((reason: unknown) => {
        if (!disposed) setState((current) => ({
          ...current,
          loading: false,
          error: reason instanceof Error ? reason.message : String(reason),
        }));
      });

    void getChats({ agentKey: key, limit: 20 })
      .then(({ data }) => {
        if (!disposed) setState((current) => ({
          ...current,
          chats: Array.isArray(data) ? data as Chat[] : [],
        }));
      })
      .catch((reason: unknown) => {
        if (!disposed) setState((current) => ({
          ...current,
          chatsError: reason instanceof Error ? reason.message : String(reason),
        }));
      });

    return () => { disposed = true; };
  }, [key]);

  return state.agentKey === key ? state : initialState(key);
}
