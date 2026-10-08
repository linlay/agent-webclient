import { useCallback, useEffect, useRef, useState } from "react";
import { useAppContext } from "@/app/state/AppContext";
import { getAgent, setAgentConnector } from "@/shared/data";
import { invalidateAgentDetail } from "@/shared/data/api/routedClient";

const asError = (cause: unknown) => cause instanceof Error ? cause : new Error(String(cause));

/** The current Agent owns associations; this hook only owns the switch mutation. */
export function useAgentConnectors(agentKey: string) {
  const { state, stateRef, dispatch } = useAppContext();
  const agent = state.agents.find(item => item.key === agentKey);
  const ids = agent?.connectors;
  const availability = state.agentAvailability[agentKey];
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const scope = useRef(0);
  const request = useRef(0);
  const saving = useRef(false);
  const attempted = useRef(false);

  const refresh = useCallback(async (force = true) => {
    if (!agentKey || saving.current) return;
    const current = ++request.current;
    if (force) {
      invalidateAgentDetail(agentKey);
      window.dispatchEvent(new CustomEvent("agent:availability-refresh", { detail: { agentKey } }));
    }
    setLoading(true);
    try {
      const { data } = await getAgent(agentKey);
      if (current !== request.current) return;
      if (data.key !== agentKey || !Array.isArray(data.connectors) || !data.connectors.every(id => typeof id === "string")) {
        throw new Error("Agent connector associations are unavailable");
      }
      const agents = stateRef.current.agents;
      dispatch({ type: "SET_AGENTS", agents: agents.some(item => item.key === agentKey)
        ? agents.map(item => item.key === agentKey ? { ...item, connectors: data.connectors } : item)
        : [...agents, { key: data.key, name: data.name, connectors: data.connectors }] });
      setLoadError(null);
    } catch (cause) {
      if (current === request.current) setLoadError(asError(cause));
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [agentKey, dispatch, stateRef]);

  useEffect(() => {
    scope.current += 1;
    attempted.current = false;
    saving.current = false;
    setLoading(false);
    setSavingId("");
    setLoadError(null);
    setSaveError(null);
    setCatalogRevision(0);
    return () => { scope.current += 1; request.current += 1; };
  }, [agentKey]);
  useEffect(() => {
    // Normally Composer has hydrated this Agent already. A missing detail uses
    // the same cached/deduped /api/agent request, never a separate mount read.
    if (agentKey && !Array.isArray(ids) && !attempted.current && (!availability || availability === "available")) {
      attempted.current = true;
      void refresh(false);
    }
  }, [agentKey, ids, availability, refresh]);

  const setSelected = useCallback(async (connectorId: string, enabled: boolean) => {
    if (!agentKey || !Array.isArray(ids) || loadError || (availability && availability !== "available") || saving.current) return;
    const currentScope = scope.current;
    saving.current = true;
    request.current += 1;
    invalidateAgentDetail(agentKey);
    window.dispatchEvent(new CustomEvent("agent:availability-invalidate", { detail: { agentKey } }));
    setLoading(false);
    setSavingId(connectorId);
    setSaveError(null);
    let failed = false;
    try {
      const { data } = await setAgentConnector({ agentKey, connectorId, enabled });
      if (currentScope !== scope.current) return;
      if (data.agentKey !== agentKey || !Array.isArray(data.connectorIds) || !data.connectorIds.every(id => typeof id === "string")) throw new Error("Agent connector identity mismatch");
      // Invalidate checks that started before/during this save before publishing.
      invalidateAgentDetail(agentKey);
      window.dispatchEvent(new CustomEvent("agent:availability-invalidate", { detail: { agentKey } }));
      dispatch({ type: "SET_AGENTS", agents: stateRef.current.agents.map(item => item.key === agentKey
        ? { ...item, connectors: data.connectorIds } : item) });
    } catch (cause) {
      failed = true;
      if (currentScope === scope.current) setSaveError(asError(cause));
    } finally {
      if (currentScope === scope.current) {
        saving.current = false;
        setSavingId("");
        setCatalogRevision(value => value + 1);
        // The response may be lost after saving. Confirm source through Agent.
        window.dispatchEvent(new CustomEvent("agent:availability-refresh", { detail: { agentKey } }));
        if (failed) void refresh(false);
      }
    }
  }, [agentKey, ids, availability, loadError, refresh, dispatch, stateRef]);

  const unavailable = availability && !["available", "checking"].includes(availability);
  return { data: agentKey && Array.isArray(ids) ? { agentKey, connectorIds: ids } : null,
    loading: loading || availability === "checking", savingId,
    loadError: loadError || (unavailable ? new Error(`Agent ${availability}`) : null),
    saveError, refresh, setSelected, catalogRevision };
}
