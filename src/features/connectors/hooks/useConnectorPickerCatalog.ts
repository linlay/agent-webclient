import { useCallback, useEffect, useRef, useState } from "react";
import { getAdminConnectors, type ConnectorSummary } from "@/shared/data";
import { usePushTransport } from "@/features/transport/hooks/useRealtimeTransport";
import { isConnectorCatalogUpdate } from "../lib/connectorCatalog";

// The composer only needs the package catalog, not the management console's tool inventory.
export function useConnectorPickerCatalog() {
  const push = usePushTransport();
  const [items, setItems] = useState<ConnectorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const response = await getAdminConnectors();
      if (request !== generation.current) return;
      setItems(response.data.connectors || []);
      setError(null);
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = push.subscribe({ types: ["catalog.updated"] }, frame => {
      if (isConnectorCatalogUpdate(frame)) void refresh();
    });
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      generation.current += 1;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [push, refresh]);

  return { items, loading, error, refresh };
}
