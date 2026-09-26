import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useAppContext } from "@/app/state/AppContext";
import { ApiError, getAgent } from "@/shared/data";
import { invalidateAgentDetail } from "@/shared/data/api/routedClient";
import type { Agent, AgentAvailability } from "@/features/agents/lib/agentState";

const useBrowserLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

export function classifyAgentAvailabilityError(error: unknown): AgentAvailability {
  if (error instanceof ApiError) {
    if (error.status === 401) return "authentication_required";
    if (error.status === 403) return "forbidden";
    if (error.status === 404) return "unavailable";
  }
  return "error";
}

/** Check current execution metadata independently of persisted Chat replay. */
export function useAgentAvailability(agentKey: string, chatId: string) {
  const { dispatch, stateRef } = useAppContext();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ identity: string; status: AgentAvailability } | null>(null);
  const identity = `${agentKey}\u0000${chatId}\u0000${revision}`;
  const retry = useCallback(() => {
    invalidateAgentDetail();
    setRevision(value => value + 1);
  }, []);

  useBrowserLayoutEffect(() => {
    if (!agentKey) return;
    let settled = false;
    const publish = (status: AgentAvailability) => {
      setResult({ identity, status });
      dispatch({ type: "SET_AGENT_AVAILABILITY", agentKey, status });
    };
    publish("checking");
    const timeout = setTimeout(() => {
      settled = true;
      publish("error");
    }, 15_000);
    invalidateAgentDetail();
    void getAgent(agentKey).then(({ data }) => {
      if (settled) return;
      if (!data || data.key !== agentKey) throw new Error("Agent identity mismatch");
      settled = true;
      clearTimeout(timeout);
      // Only a successful current definition may enter the Agent catalog.
      const agents = stateRef.current.agents;
      const definition = { ...data, source: data.source ? { ...data.source } : undefined } as unknown as Agent;
      const existing = agents.find(agent => agent.key === agentKey);
      dispatch({ type: "SET_AGENTS", agents: existing
        ? agents.map(agent => agent.key === agentKey ? { ...agent, ...definition } : agent)
        : [...agents, definition] });
      publish("available");
    }).catch((error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      publish(classifyAgentAvailabilityError(error));
    });
    return () => { settled = true; clearTimeout(timeout); };
  }, [agentKey, identity, dispatch, stateRef]);

  useEffect(() => {
    if (!agentKey) return;
    window.addEventListener("focus", retry);
    return () => window.removeEventListener("focus", retry);
  }, [agentKey, retry]);

  return {
    status: !agentKey ? "available" as const : result?.identity === identity ? result.status : "checking" as const,
    retry,
  };
}
