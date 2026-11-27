import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent } from "@/features/agents/lib/agentState";
import { useAppContext } from "@/app/state/AppContext";
import { getAgent, getConnectorConnection, setAgentConnector, type ConnectorConnection } from "@/shared/data";
import { invalidateAgentDetail } from "@/shared/data/api/routedClient";
import { useReconnectSignal } from "@/features/transport/hooks/useRefreshSignals";
import { ConnectorChatError, readConnectorConnection } from "../lib/connectorChat";

const asError = (cause: unknown) => cause instanceof Error ? cause : new Error(String(cause));
// Platform owns builtin.*. Its older delegated CLIs have no managed account;
// external delegated packages must still satisfy their configured marker.
const hasConnectionConfiguration = (connection: ConnectorConnection) => !connection.configurationRequired || connection.configured
  || connection.connectorId.toLowerCase().startsWith("builtin.") && ["delegated", "not_required"].includes(connection.authentication.status);

/** Agent owns associations; connector configuration is checked before adding a mount. */
export function useAgentConnectors(agentKey: string) {
  const { state, dispatch } = useAppContext();
  const agent = state.currentAgent?.key === agentKey ? state.currentAgent : null;
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
      dispatch({ type: "SET_CURRENT_AGENT", agent: { ...data } as unknown as Agent });
      setLoadError(null);
    } catch (cause) {
      if (current === request.current) setLoadError(asError(cause));
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [agentKey, dispatch]);

  useReconnectSignal(() => {
    if (!Array.isArray(ids) || loadError) void refresh(false);
  }, !!agentKey);

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
    let reconcile = false;
    try {
      if (enabled) {
        const connection = readConnectorConnection((await getConnectorConnection(connectorId)).data, connectorId);
        if (currentScope !== scope.current) return;
        if (!hasConnectionConfiguration(connection)) throw new ConnectorChatError("configurationRequired");
      }
      reconcile = true;
      const { data } = await setAgentConnector({ agentKey, connectorId, enabled });
      if (currentScope !== scope.current) return;
      if (data.agentKey !== agentKey || !Array.isArray(data.connectorIds) || !data.connectorIds.every(id => typeof id === "string")) throw new Error("Agent connector identity mismatch");
      // Invalidate checks that started before/during this save before publishing.
      invalidateAgentDetail(agentKey);
      window.dispatchEvent(new CustomEvent("agent:availability-invalidate", { detail: { agentKey } }));
      dispatch({ type: "PATCH_CURRENT_AGENT", agentKey, patch: { connectors: data.connectorIds } });
      reconcile = false;
    } catch (cause) {
      if (currentScope === scope.current) setSaveError(asError(cause));
    } finally {
      if (currentScope === scope.current) {
        saving.current = false;
        setSavingId("");
        setCatalogRevision(value => value + 1);
        // The response may be lost after saving. Confirm source through Agent.
        window.dispatchEvent(new CustomEvent("agent:availability-refresh", { detail: { agentKey } }));
        if (reconcile) void refresh(false);
      }
    }
  }, [agentKey, ids, availability, loadError, refresh, dispatch]);

  const unavailable = availability && !["available", "checking"].includes(availability);
  return { data: agentKey && Array.isArray(ids) ? { agentKey, connectorIds: ids } : null,
    loading: loading || availability === "checking", savingId,
    loadError: loadError || (unavailable ? new Error(`Agent ${availability}`) : null),
    saveError, refresh, setSelected, catalogRevision };
}
