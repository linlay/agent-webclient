export function sortPinnedItems<T>(
  items: readonly T[],
  pinnedKeys: readonly string[],
  getKey: (item: T) => string,
): T[] {
  const order = new Map(pinnedKeys.map((key, index) => [key.trim().toLowerCase(), index]));
  const rank = (skill: T) => order.get(getKey(skill).trim().toLowerCase()) ?? pinnedKeys.length;
  return [...items].sort((a, b) => rank(a) - rank(b));
}
