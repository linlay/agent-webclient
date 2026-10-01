export type SkillKindFilter = "package" | "standalone" | null;

type CatalogItem = { kind: Exclude<SkillKindFilter, null>; id: string; label: string };

/** Both catalog surfaces rank exact package/skill IDs in one shared pin order. */
export function orderSkillCatalogItems<T extends CatalogItem>(
  items: readonly T[],
  pinnedIds: readonly string[],
  locale: string,
): T[] {
  const pinOrder = new Map(pinnedIds.map((key, index) => [key.trim().toLowerCase(), index]));
  const rank = (item: T) => pinOrder.get(item.id.trim().toLowerCase()) ?? pinnedIds.length;
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  return [...items].sort((a, b) => rank(a) - rank(b)
    || collator.compare(a.label, b.label)
    || collator.compare(a.id, b.id)
    || a.kind.localeCompare(b.kind));
}
