import { useCallback, useEffect, useRef, useState } from "react";
import { getConnectors, type ConnectorOption } from "@/shared/data";
import { usePushTransport } from "@/features/transport/hooks/useRealtimeTransport";
import { useReconnectSignal } from "@/features/transport/hooks/useRefreshSignals";
import { isConnectorCatalogUpdate } from "../lib/connectorCatalog";

const EMPTY_ITEMS: ConnectorOption[] = [];

// The composer only needs the package catalog, not the management console's tool inventory.
export function useConnectorPickerCatalog(agentKey: string, revision = 0) {
  const push = usePushTransport();
  const [snapshot, setSnapshot] = useState<{ agentKey: string; items: ConnectorOption[]; reloadPending: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const current = snapshot?.agentKey === agentKey ? snapshot : null;
  const items = current?.items ?? EMPTY_ITEMS;
  const reloadPending = current?.reloadPending ?? false;
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const response = await getConnectors(agentKey);
      if (request !== generation.current) return;
      setSnapshot({ agentKey, items: response.data.connectors || [], reloadPending: response.data.reloadPending === true });
      setError(null);
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [agentKey]);

  // Desktop may retire the initial Frame Port while registering the surface.
  // Recover the visible composer catalog without waiting for a menu to mount.
  useReconnectSignal(() => { void refresh(); });

  useEffect(() => {
    setSnapshot(null);
    setError(null);
    void refresh();
    const unsubscribe = push.subscribe({ types: ["catalog.updated"] }, frame => {
      const value = frame as { data?: { reason?: string } };
      if (isConnectorCatalogUpdate(frame) || value.data?.reason === "agents") void refresh();
    });
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      generation.current += 1;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [push, refresh]);

  useEffect(() => { if (revision > 0) void refresh(); }, [revision, refresh]);
  useEffect(() => {
    if (loading || error) return;
    const pending = reloadPending || items.some(item => item.availability?.state === "pending");
    if (!pending && !items.some(item => item.active === true)) return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible") void refresh();
    }, pending ? 2_000 : 30_000);
    return () => window.clearTimeout(timer);
  }, [items, reloadPending, loading, error, refresh]);

  return { items, loading, error, refresh, reloadPending };
}
