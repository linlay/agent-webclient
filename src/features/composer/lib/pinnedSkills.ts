export function sortPinnedSkills<T extends { key: string }>(
  skills: readonly T[],
  pinnedKeys: readonly string[],
): T[] {
  const order = new Map(pinnedKeys.map((key, index) => [key.trim().toLowerCase(), index]));
  const rank = (skill: T) => order.get(skill.key.trim().toLowerCase()) ?? pinnedKeys.length;
  return [...skills].sort((a, b) => rank(a) - rank(b));
}
