import { useCallback, useEffect, useRef, useState } from "react";
import { getAgentConnectors, setAgentConnector, type AgentConnectorsResponse } from "@/shared/data";
import { usePushTransport } from "@/features/transport/hooks/useRealtimeTransport";

const asError = (cause: unknown) => cause instanceof Error ? cause : new Error(String(cause));

export function useAgentConnectors(agentKey: string) {
  const push = usePushTransport();
  const [data, setData] = useState<AgentConnectorsResponse | null>(null);
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
      const response = await getAgentConnectors(agentKey);
      if (current !== request.current) return;
      setData(response.data);
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
    return () => {
      scope.current += 1;
      request.current += 1;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
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
    if (!currentData?.reloadPending || savingId || loading || loadError) return;
    const timer = window.setTimeout(() => void refresh(), 2_000);
    return () => window.clearTimeout(timer);
  }, [currentData, savingId, loading, loadError, refresh]);

  return { data: currentData, loading, savingId, loadError, saveError, refresh, setSelected };
}
