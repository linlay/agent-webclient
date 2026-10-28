const guards = new Map<string, () => boolean>();

/** Registered by a viewer that owns unsaved work; the tab host asks before closing. */
export function registerViewerCloseGuard(key: string, guard: () => boolean) {
  const normalized = String(key || "").trim();
  if (!normalized) return () => undefined;
  guards.set(normalized, guard);
  return () => {
    if (guards.get(normalized) === guard) guards.delete(normalized);
  };
}

export function confirmViewerClose(key: string): boolean {
  const guard = guards.get(String(key || "").trim());
  return guard ? guard() : true;
}
