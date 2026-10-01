import { useCallback, useEffect, useLayoutEffect, useRef, useReducer } from "react";
import { useAppContext } from "@/app/state/AppContext";
import { ApiError, getAgent } from "@/shared/data";
import { invalidateAgentDetail } from "@/shared/data/api/routedClient";
import { getDataSessionRevision } from "@/shared/data/auth/dataSession";
import { getBackendMode } from "@/shared/config/backendMode";
import { usePushSignal, useReconnectSignal } from "@/features/transport/hooks/useRefreshSignals";
import { agentRefresh, affectsAgentCatalog } from "@/features/agents/lib/agentRefresh";
import type { Agent, AgentAvailability } from "@/features/agents/lib/agentState";
const useBrowserLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;
export function classifyAgentAvailabilityError(error: unknown): AgentAvailability {
  if (error instanceof ApiError) {
    if (error.status === 401) return "authentication_required";
    if (error.status === 403) return "forbidden";
    if (error.status === 404 || error.status === 422) return "unavailable";
  }
  return "error";
}
export function useAgentAvailability(agentKey: string, _chatId: string) {
  const { dispatch, stateRef } = useAppContext();
  const [, rerender] = useReducer(value => value + 1, 0);
  const session = getDataSessionRevision();
  const previousSession = useRef(session);
  const refresh = useCallback((changed = true) => {
    if (!agentKey) return;
    const coordinator = agentRefresh(stateRef, agentKey);
    const publish = (status: AgentAvailability) => {
      dispatch({ type: "SET_AGENT_AVAILABILITY", agentKey, status });
      rerender();
    };
    if (!stateRef.current.agentAvailability[agentKey]) publish("checking");
    void coordinator.read(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          getAgent(agentKey).then(({ data }) => {
            if (data?.key !== agentKey) throw new Error("Agent identity mismatch");
            return data;
          }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Agent check timed out")), 15_000); }),
        ]);
      } finally { clearTimeout(timer); }
    }, () => invalidateAgentDetail(agentKey), data => {
      if (session !== getDataSessionRevision()) return;
      const agents = stateRef.current.agents;
      const definition = { ...data } as unknown as Agent;
      dispatch({ type: "SET_AGENTS", agents: agents.some(agent => agent.key === agentKey)
        ? agents.map(agent => agent.key === agentKey ? { ...agent, ...definition } : agent) : [...agents, definition] });
      publish("available");
    }, error => { if (session === getDataSessionRevision()) publish(classifyAgentAvailabilityError(error)); }, changed);
  }, [agentKey, dispatch, session, stateRef]);
  useBrowserLayoutEffect(() => {
    const changed = previousSession.current !== session;
    previousSession.current = session;
    if (changed) { invalidateAgentDetail(); dispatch({ type: "CLEAR_AGENT_AVAILABILITY" }); }
    if (changed && agentKey) dispatch({ type: "SET_AGENT_AVAILABILITY", agentKey, status: "checking" });
    refresh(changed);
    return () => { if (agentKey) agentRefresh(stateRef, agentKey).cancel(() => undefined); };
  }, [refresh, session, agentKey, dispatch]);
  usePushSignal("catalog.updated", frame => { if (affectsAgentCatalog(frame)) refresh(); }, !!agentKey);
  useReconnectSignal(() => refresh(), !!agentKey);
  useEffect(() => {
    if (!agentKey) return;
    const focus = () => {
      if (agentRefresh(stateRef, agentKey).busy) return;
      const status = stateRef.current.agentAvailability[agentKey];
      if (["unavailable", "forbidden", "error"].includes(status)) refresh();
      else if (getBackendMode() === "gateway" && status === "available") refresh(false);
    };
    const requested = (event: Event) => {
      if ((event as CustomEvent).detail?.agentKey === agentKey) refresh();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("agent:availability-refresh", requested);
    return () => { window.removeEventListener("focus", focus); window.removeEventListener("agent:availability-refresh", requested); };
  }, [agentKey, refresh, stateRef]);
  return { status: !agentKey ? "available" as const : stateRef.current.agentAvailability[agentKey] || "checking" as const, retry: () => refresh() };
}
