import { useCallback, useEffect, useRef, useState } from "react";
import { useAppContext } from "@/app/state/AppContext";
import { getAgent, getConnectorConnection, getConnectorConnections, setAgentConnector, type ConnectorConnection } from "@/shared/data";
import { invalidateAgentDetail } from "@/shared/data/api/routedClient";
import { usePushTransport } from "@/features/transport/hooks/useRealtimeTransport";
import { ConnectorChatError, readConnectorConnection } from "../lib/connectorChat";

const asError = (cause: unknown) => cause instanceof Error ? cause : new Error(String(cause));
// Platform owns builtin.*. Its older delegated CLIs have no managed account;
// external delegated packages must still satisfy their configured marker.
const hasConnectionConfiguration = (connection: ConnectorConnection) => !connection.configurationRequired || connection.configured
  || connection.connectorId.toLowerCase().startsWith("builtin.") && ["delegated", "not_required"].includes(connection.authentication.status);

/** Agent owns associations; this hook observes connection configuration and owns switch mutations. */
export function useAgentConnectors(agentKey: string) {
  const { state, stateRef, dispatch } = useAppContext();
  const push = usePushTransport();
  const agent = state.agents.find(item => item.key === agentKey);
  const ids = agent?.connectors;
  const availability = state.agentAvailability[agentKey];
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [availableIds, setAvailableIds] = useState<string[] | null>(null);
  const [configurationLoading, setConfigurationLoading] = useState(false);
  const [configurationError, setConfigurationError] = useState<Error | null>(null);
  const scope = useRef(0);
  const request = useRef(0);
  const saving = useRef(false);
  const attempted = useRef(false);
  const configurationRequest = useRef(0);
  const configurationRefreshQueued = useRef(false);
  const configuredIds = useRef<string[] | null>(null);

  const refreshConfiguration = useCallback(async () => {
    if (!agentKey) return;
    if (saving.current) { configurationRefreshQueued.current = true; return; }
    const current = ++configurationRequest.current;
    setConfigurationLoading(true);
    try {
      const response = await getConnectorConnections();
      if (current !== configurationRequest.current) return;
      const next = response.data.connections
        .map(connection => readConnectorConnection(connection, connection.connectorId))
        .filter(hasConnectionConfiguration).map(connection => connection.connectorId);
      const previous = configuredIds.current;
      if (previous && (previous.length !== next.length || next.some(id => !previous.includes(id)))) {
        setCatalogRevision(value => value + 1);
      }
      configuredIds.current = next;
      setAvailableIds(next);
      setConfigurationError(null);
    } catch (cause) {
      if (current === configurationRequest.current) setConfigurationError(asError(cause));
    } finally {
      if (current === configurationRequest.current) setConfigurationLoading(false);
    }
  }, [agentKey]);

  const refresh = useCallback(async (force = true) => {
    if (!agentKey || saving.current) return;
    const current = ++request.current;
    if (force) {
      invalidateAgentDetail(agentKey);
      window.dispatchEvent(new CustomEvent("agent:availability-refresh", { detail: { agentKey } }));
      void refreshConfiguration();
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
  }, [agentKey, dispatch, stateRef, refreshConfiguration]);

  useEffect(() => {
    scope.current += 1;
    attempted.current = false;
    saving.current = false;
    setLoading(false);
    setSavingId("");
    setLoadError(null);
    setSaveError(null);
    setCatalogRevision(0);
    setAvailableIds(null);
    setConfigurationError(null);
    setConfigurationLoading(false);
    configurationRefreshQueued.current = false;
    configuredIds.current = null;
    return () => { scope.current += 1; request.current += 1; configurationRequest.current += 1; };
  }, [agentKey]);
  useEffect(() => {
    if (!agentKey) return;
    void refreshConfiguration();
    const unsubscribe = push.subscribe({ types: ["catalog.updated"] }, frame => {
      const value = frame as { data?: { reason?: string } };
      if (["agents", "connectors", "config"].includes(value.data?.reason || "")) void refreshConfiguration();
    });
    const onVisible = () => { if (document.visibilityState === "visible") void refreshConfiguration(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      configurationRequest.current += 1;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [agentKey, push, refreshConfiguration]);
  useEffect(() => {
    if (!availableIds || configurationLoading || configurationError || savingId) return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible") void refreshConfiguration();
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [availableIds, configurationLoading, configurationError, savingId, refreshConfiguration]);
  useEffect(() => {
    // Normally Composer has hydrated this Agent already. A missing detail uses
    // the same cached/deduped /api/agent request, never a separate mount read.
    if (agentKey && !Array.isArray(ids) && !attempted.current && (!availability || availability === "available")) {
      attempted.current = true;
      void refresh(false);
    }
  }, [agentKey, ids, availability, refresh]);

  const setSelected = useCallback(async (connectorId: string, enabled: boolean) => {
    if (!agentKey || !Array.isArray(ids) || !availableIds || loadError || configurationError || (availability && availability !== "available") || saving.current) return;
    const currentScope = scope.current;
    saving.current = true;
    request.current += 1;
    configurationRequest.current += 1;
    setConfigurationLoading(false);
    invalidateAgentDetail(agentKey);
    window.dispatchEvent(new CustomEvent("agent:availability-invalidate", { detail: { agentKey } }));
    setLoading(false);
    setSavingId(connectorId);
    setSaveError(null);
    let failed = false;
    try {
      if (enabled) {
        const connection = readConnectorConnection((await getConnectorConnection(connectorId)).data, connectorId);
        if (currentScope !== scope.current) return;
        if (!hasConnectionConfiguration(connection)) throw new ConnectorChatError("configurationRequired");
        setAvailableIds(previous => previous?.includes(connectorId) ? previous : [...(previous || []), connectorId]);
      }
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
        if (failed || configurationRefreshQueued.current) {
          configurationRefreshQueued.current = false;
          void refreshConfiguration();
        }
      }
    }
  }, [agentKey, ids, availability, availableIds, loadError, configurationError, refresh, refreshConfiguration, dispatch, stateRef]);

  const unavailable = availability && !["available", "checking"].includes(availability);
  return { data: agentKey && Array.isArray(ids) && availableIds ? { agentKey, connectorIds: ids } : null,
    availableIds: availableIds || [],
    loading: loading || availability === "checking" || configurationLoading && !availableIds, savingId,
    loadError: loadError || configurationError || (unavailable ? new Error(`Agent ${availability}`) : null),
    saveError, refresh, setSelected, catalogRevision };
}
