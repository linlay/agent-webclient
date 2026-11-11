import { getClientStorage } from "@/shared/utils/clientStorage";
import { useCallback, useEffect, useState } from "react";
import { useAppContext } from "@/app/state/AppContext";
import { resolveStorageIdentity } from "@/shared/data/auth/storageIdentity";
import { moveSidebarItem, normalizeSidebarOrder, sortSidebarItems } from "../lib/sidebarOrder";

const ORDER_CHANGED = "agent-webclient:sidebar-order-changed";

function readOrder(key: string): string[] {
  try { return normalizeSidebarOrder(JSON.parse(getClientStorage("local").getItem(key) || "[]")); }
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
    const onLocalChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; order: string[] }>).detail;
      if (detail.key === key) setSaved({ key, order: detail.order });
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(ORDER_CHANGED, onLocalChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ORDER_CHANGED, onLocalChange);
    };
  }, [key]);
  const save = useCallback((next: string[]) => {
    setSaved({ key, order: next });
    try { getClientStorage("local").setItem(key, JSON.stringify(next)); }
    catch { /* Keep the current in-memory order when storage is unavailable. */ }
    window.dispatchEvent(new CustomEvent(ORDER_CHANGED, { detail: { key, order: next } }));
  }, [key]);
  return {
    ids: order,
    toggle: (id: string) => save(order.includes(id) ? order.filter(value => value !== id) : [...order, id]),
    manual: order.length > 0,
    sort: <T,>(items: T[], getId: (item: T) => string) => sortSidebarItems(items, order, getId),
    move: (ids: string[], active: string, target: string, after: boolean) => save(moveSidebarItem(order, ids, active, target, after)),
    reset: () => save([]),
  };
}
