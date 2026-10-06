import { useCallback, useEffect, useRef, useState } from "react";
import { getAdminAgentConnectors, getAdminConnectors, type ConnectorSummary } from "@/shared/data";
import { usePushTransport } from "@/features/transport/hooks/useRealtimeTransport";

export function useAgentPresetConnectors(agentKey: string) {
  const push = usePushTransport();
  const [items, setItems] = useState<Pick<ConnectorSummary, "id" | "name" | "description" | "iconUrl">[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    if (!agentKey) return;
    const current = ++request.current;
    setLoading(true);
    try {
      const [selection, catalog] = await Promise.all([getAdminAgentConnectors(agentKey), getAdminConnectors()]);
      if (current !== request.current) return;
      if (selection.data.agentKey !== agentKey) throw new Error("Invalid Agent connector response");
      setItems(selection.data.presetConnectorIds.map(id => catalog.data.connectors.find(item => item.id === id)
        || { id, name: id }));
      setError(null);
    } catch (cause) {
      if (current === request.current) setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [agentKey]);

  useEffect(() => {
    setItems([]);
    setError(null);
    void refresh();
    const unsubscribe = push.subscribe({ types: ["catalog.updated"] }, frame => {
      const value = frame as { data?: { reason?: string } };
      if (["agents", "connectors", "config"].includes(value.data?.reason || "")) void refresh();
    });
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { request.current += 1; unsubscribe(); document.removeEventListener("visibilitychange", onVisible); };
  }, [push, refresh]);

  return { items, loading, error, refresh };
}
