import { useCallback, useEffect, useRef, useState } from "react";
import { getConnectors, type ConnectorOption } from "@/shared/data";
import { usePushTransport } from "@/features/transport/hooks/useRealtimeTransport";
import { isConnectorCatalogUpdate } from "../lib/connectorCatalog";

// The composer only needs the package catalog, not the management console's tool inventory.
export function useConnectorPickerCatalog(agentKey: string, revision = 0) {
  const push = usePushTransport();
  const [items, setItems] = useState<ConnectorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadPending, setReloadPending] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const response = await getConnectors(agentKey);
      if (request !== generation.current) return;
      setItems(response.data.connectors || []);
      setReloadPending(response.data.reloadPending === true);
      setError(null);
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [agentKey]);

  useEffect(() => {
    setItems([]);
    setError(null);
    setReloadPending(false);
    void refresh();
    const unsubscribe = push.subscribe({ types: ["catalog.updated"] }, frame => {
      const value = frame as { data?: { reason?: string } };
      if (isConnectorCatalogUpdate(frame) || value.data?.reason === "agents") void refresh();
    });
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      generation.current += 1;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [push, refresh]);

  useEffect(() => { if (revision > 0) void refresh(); }, [revision, refresh]);
  useEffect(() => {
    if (loading || error || !(reloadPending || items.some(item => item.readiness === "preparing"
      || item.readiness === "pending_verification" || item.mcp?.some(server => ["pending", "syncing"].includes(server.status))))) return;
    const timer = window.setTimeout(() => void refresh(), 2_000);
    return () => window.clearTimeout(timer);
  }, [items, reloadPending, loading, error, refresh]);

  return { items, loading, error, refresh, reloadPending };
}
