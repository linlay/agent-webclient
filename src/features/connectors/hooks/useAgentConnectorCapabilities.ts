import { useCallback, useEffect, useRef, useState } from "react";
import { getAdminAgentConnectors, getAdminConnectors, type AdminAgentConnectorsResponse } from "@/shared/data";
import { usePushTransport } from "@/features/transport/hooks/useRealtimeTransport";
import { agentConnectorCapabilities, type AgentConnectorCapability } from "../lib/agentConnectorCapabilities";

const emptyItems: AgentConnectorCapability[] = [];
const emptyNames: string[] = [];
export function useAgentConnectorCapabilities(agentKey: string, bindings?: AdminAgentConnectorsResponse | null) {
  const push = usePushTransport();
  const [snapshot, setSnapshot] = useState<{ agentKey: string; items: AgentConnectorCapability[]; ownedToolNames: string[]; reloadPending: boolean }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    try {
      const [selection, catalog] = await Promise.all([(bindings !== undefined ? Promise.resolve(bindings ? { data: bindings } : null) : agentKey ? getAdminAgentConnectors(agentKey) : Promise.resolve(null)), getAdminConnectors()]);
      if (current !== request.current) return;
      if (selection && selection.data.agentKey !== agentKey) throw new Error("Invalid Agent connector response");
      setSnapshot({ agentKey, items: selection ? agentConnectorCapabilities(selection.data, catalog.data.connectors) : [],
        ownedToolNames: catalog.data.connectors.flatMap(item => item.nativeTools || []), reloadPending: selection?.data.reloadPending || false });
      setError(null);
    } catch (cause) {
      if (current === request.current) setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [agentKey, bindings]);

  useEffect(() => {
    setSnapshot(undefined);
    setError(null);
    void refresh();
    const unsubscribe = push.subscribe({ types: ["catalog.updated"] }, frame => {
      const value = frame as { data?: { reason?: string } };
      if (["agents", "connectors", "config"].includes(value.data?.reason || "")) void refresh();
    });
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { request.current += 1; unsubscribe(); document.removeEventListener("visibilitychange", onVisible); };
  }, [push, refresh, agentKey]);

  const current = snapshot?.agentKey === agentKey ? snapshot : undefined;
  return { ready: !!current && !error, items: current?.items || emptyItems, ownedToolNames: current?.ownedToolNames || emptyNames,
    reloadPending: current?.reloadPending || false, loading, error, refresh };
}
