/** Sidebar display preferences only; never change chat ownership or pin order. */
export function normalizeSidebarOrder(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))] : [];
}

export function sortSidebarItems<T>(items: T[], order: string[], getId: (item: T) => string): T[] {
  const ranks = new Map(order.map((id, index) => [id, index]));
  return items.slice().sort((a, b) => (ranks.get(getId(a)) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(getId(b)) ?? Number.MAX_SAFE_INTEGER));
}

export function moveSidebarItem(order: string[], visibleIds: string[], active: string, target: string, after: boolean): string[] {
  if (active === target || !visibleIds.includes(active) || !visibleIds.includes(target)) return order;
  // Preserve unloaded entries when previews are paginated or temporarily hidden.
  const next = [...new Set([...order, ...visibleIds])].filter(id => id !== active);
  next.splice(next.indexOf(target) + (after ? 1 : 0), 0, active);
  return next;
}
