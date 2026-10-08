import { useCallback, useEffect, useRef, useState } from "react";
import { getAgentConnectors, getConnectorConnection, getConnectorConnections, setAgentConnector, type AgentConnectorsResponse, type ConnectorConnection } from "@/shared/data";
import { usePushTransport } from "@/features/transport/hooks/useRealtimeTransport";
import { ConnectorChatError, readConnectorConnection } from "../lib/connectorChat";

const asError = (cause: unknown) => cause instanceof Error ? cause : new Error(String(cause));
// Platform reserves builtin.* for its own packages. Older builtin CLIs delegate
// configuration; external delegated packages still need their connection marker.
const hasConnectionConfiguration = (connection: ConnectorConnection) => !connection.configurationRequired || connection.configured
  || connection.connectorId.toLowerCase().startsWith("builtin.") && ["delegated", "not_required"].includes(connection.authentication.status);

export function useAgentConnectors(agentKey: string) {
  const push = usePushTransport();
  const [data, setData] = useState<AgentConnectorsResponse | null>(null);
  const [availableIds, setAvailableIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const scope = useRef(0);
  const request = useRef(0);
  const saving = useRef(false);
  const refreshQueued = useRef(false);

  const refresh = useCallback(async () => {
    if (!agentKey) return;
    if (saving.current) { refreshQueued.current = true; return; }
    const current = ++request.current;
    setLoading(true);
    try {
      const [response, connections] = await Promise.all([getAgentConnectors(agentKey), getConnectorConnections()]);
      if (current !== request.current) return;
      const available = connections.data.connections
        .map(connection => readConnectorConnection(connection, connection.connectorId))
        .filter(hasConnectionConfiguration)
        .map(connection => connection.connectorId);
      setData(response.data);
      setAvailableIds(available);
      setLoadError(null);
    } catch (cause) {
      if (current === request.current) setLoadError(asError(cause));
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [agentKey]);

  useEffect(() => {
    scope.current += 1;
    saving.current = false;
    refreshQueued.current = false;
    setData(null);
    setAvailableIds([]);
    setSavingId("");
    setLoadError(null);
    setSaveError(null);
    void refresh();
    const unsubscribe = push.subscribe({ types: ["catalog.updated"] }, frame => {
      const value = frame as { data?: { reason?: string } };
      if (["agents", "connectors", "config"].includes(value.data?.reason || "")) void refresh();
    });
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      scope.current += 1;
      request.current += 1;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [push, refresh]);

  const setSelected = useCallback(async (connectorId: string, enabled: boolean) => {
    if (!agentKey || data?.agentKey !== agentKey || loadError || saving.current) return;
    const currentScope = scope.current;
    saving.current = true;
    request.current += 1;
    setLoading(false);
    setSavingId(connectorId);
    setSaveError(null);
    try {
      if (enabled) {
        const connection = readConnectorConnection((await getConnectorConnection(connectorId)).data, connectorId);
        if (currentScope !== scope.current) return;
        if (!hasConnectionConfiguration(connection)) {
          throw new ConnectorChatError("configurationRequired");
        }
        setAvailableIds(previous => previous.includes(connectorId) ? previous : [...previous, connectorId]);
      }
      const response = await setAgentConnector({ agentKey, connectorId, enabled });
      if (currentScope === scope.current) setData(response.data);
    } catch (cause) {
      if (currentScope === scope.current) {
        setSaveError(asError(cause));
        // A lost response can still have saved the source. Re-read its truth.
        refreshQueued.current = true;
      }
    } finally {
      if (currentScope === scope.current) {
        saving.current = false;
        setSavingId("");
        if (refreshQueued.current) { refreshQueued.current = false; void refresh(); }
      }
    }
  }, [agentKey, data, loadError, refresh]);

  const currentData = data?.agentKey === agentKey ? data : null;
  useEffect(() => {
    if (!currentData || savingId || loading || loadError) return;
    // Authorization is shared by the deployment and may change without an
    // Agent catalog update. Only observe its local snapshot while the picker is open.
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible") void refresh();
    }, currentData.reloadPending ? 2_000 : 30_000);
    return () => window.clearTimeout(timer);
  }, [currentData, savingId, loading, loadError, refresh]);

  return { data: currentData, availableIds: currentData ? availableIds : [], loading, savingId, loadError, saveError, refresh, setSelected };
}
