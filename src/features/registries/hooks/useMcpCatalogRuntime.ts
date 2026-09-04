import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { usePushTransport } from "@/features/transport/hooks/useRealtimeTransport";
import {
  catalogUpdateReason,
  fetchMcpCatalogSnapshot,
  MCP_CATALOG_POLL_INTERVAL_MS,
  MCP_CATALOG_PUSH_DEBOUNCE_MS,
  type McpCatalogSnapshot,
} from "@/features/registries/lib/mcpServerConsole";
import { readToolMcpServerKey } from "@/features/registries/lib/mcpRegistry";
import type { AdminRegistryListItem, AdminToolSummary } from "@/shared/data";

interface UseMcpCatalogRuntimeOptions {
  refreshBlockedRef: MutableRefObject<boolean>;
}

export function useMcpCatalogRuntime({
  refreshBlockedRef,
}: UseMcpCatalogRuntimeOptions) {
  const push = usePushTransport();
  const catalogRequestRef = useRef(0);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsRef = useRef<AdminRegistryListItem[]>([]);
  const [items, setItems] = useState<AdminRegistryListItem[]>([]);
  const [tools, setTools] = useState<AdminToolSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const applyCatalogSnapshot = useCallback((snapshot: McpCatalogSnapshot) => {
    itemsRef.current = snapshot.items;
    setItems(snapshot.items);
    setTools(snapshot.tools);
  }, []);

  const refreshCatalog = useCallback(
    async (silent = true): Promise<McpCatalogSnapshot | null> => {
      const requestId = ++catalogRequestRef.current;
      if (!silent) setError("");
      try {
        const snapshot = await fetchMcpCatalogSnapshot();
        if (requestId !== catalogRequestRef.current) return null;
        applyCatalogSnapshot(snapshot);
        return snapshot;
      } catch (loadError) {
        if (!silent && requestId === catalogRequestRef.current) {
          setError(
            loadError instanceof Error ? loadError.message : String(loadError),
          );
        }
        return null;
      }
    },
    [applyCatalogSnapshot],
  );

  const removeServerLocally = useCallback(
    (deletedFile: string, deletedServerKey: string) => {
      setItems((current) => {
        const next = current.filter((item) => item.file !== deletedFile);
        itemsRef.current = next;
        return next;
      });
      setTools((current) =>
        current.filter(
          (tool) => readToolMcpServerKey(tool) !== deletedServerKey,
        ),
      );
    },
    [],
  );

  useEffect(() => {
    const unsubscribe = push.subscribe(
      { types: ["catalog.updated"] },
      (frame) => {
        const reason = catalogUpdateReason(frame);
        if (reason !== "mcp-servers" && reason !== "config") return;
        if (refreshBlockedRef.current) return;
        if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
        pushTimerRef.current = setTimeout(() => {
          pushTimerRef.current = null;
          void refreshCatalog(true);
        }, MCP_CATALOG_PUSH_DEBOUNCE_MS);
      },
    );
    return () => {
      unsubscribe();
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, [push, refreshBlockedRef, refreshCatalog]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const refreshIfVisible = () => {
      if (
        document.visibilityState === "visible" &&
        !refreshBlockedRef.current
      ) {
        void refreshCatalog(true);
      }
    };
    const interval = window.setInterval(
      refreshIfVisible,
      MCP_CATALOG_POLL_INTERVAL_MS,
    );
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [refreshBlockedRef, refreshCatalog]);

  return {
    applyCatalogSnapshot,
    error,
    items,
    itemsRef,
    loading,
    refreshCatalog,
    removeServerLocally,
    setError,
    setLoading,
    tools,
  };
}
