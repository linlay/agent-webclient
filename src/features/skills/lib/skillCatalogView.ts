export type SkillKindFilter = "package" | "standalone" | null;

type CatalogItem = { kind: Exclude<SkillKindFilter, null>; key: string; label: string };

/** Both catalog surfaces rank exact package/skill keys in one shared pin order. */
export function orderSkillCatalogItems<T extends CatalogItem>(
  items: readonly T[],
  pinnedKeys: readonly string[],
  locale: string,
): T[] {
  const pinOrder = new Map(pinnedKeys.map((key, index) => [key.trim().toLowerCase(), index]));
  const rank = (item: T) => pinOrder.get(item.key.trim().toLowerCase()) ?? pinnedKeys.length;
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  return [...items].sort((a, b) => rank(a) - rank(b)
    || collator.compare(a.label, b.label)
    || collator.compare(a.key, b.key)
    || a.kind.localeCompare(b.kind));
}
