import { sortPinnedItems } from "@/features/catalog-order/lib/pinnedOrder";

export function sortPinnedSkills<T extends { key: string }>(skills: readonly T[], pinnedKeys: readonly string[]): T[] {
  return sortPinnedItems(skills, pinnedKeys, skill => skill.key);
}
