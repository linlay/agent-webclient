import { useCallback, useEffect, useState } from "react";
import { useAppContext } from "@/app/state/AppContext";
import { resolveStorageIdentity } from "@/shared/data/auth/storageIdentity";
import { moveSidebarItem, normalizeSidebarOrder, sortSidebarItems } from "../lib/sidebarOrder";

function readOrder(key: string): string[] {
  try { return normalizeSidebarOrder(JSON.parse(window.localStorage.getItem(key) || "[]")); }
  catch { return []; }
}

export function useSidebarOrder(group: string) {
  const { state } = useAppContext();
  const key = `agent-webclient:sidebar-order:v1:${JSON.stringify([resolveStorageIdentity(state.accessToken), group])}`;
  const [saved, setSaved] = useState(() => ({ key, order: readOrder(key) }));
  const order = saved.key === key ? saved.order : readOrder(key);
  useEffect(() => {
    setSaved({ key, order: readOrder(key) });
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setSaved({ key, order: readOrder(key) });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);
  const save = useCallback((next: string[]) => {
    setSaved({ key, order: next });
    try { window.localStorage.setItem(key, JSON.stringify(next)); }
    catch { /* Keep the current in-memory order when storage is unavailable. */ }
  }, [key]);
  return {
    manual: order.length > 0,
    sort: <T,>(items: T[], getId: (item: T) => string) => sortSidebarItems(items, order, getId),
    move: (ids: string[], active: string, target: string, after: boolean) => save(moveSidebarItem(order, ids, active, target, after)),
    reset: () => save([]),
  };
}
