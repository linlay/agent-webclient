/** Display metadata is localized by Platform; identity always remains the key. */
export function skillDisplayName(skill: { displayName?: string; name?: string; key?: string }): string {
  return skill.displayName?.trim() || skill.name?.trim() || skill.key?.trim() || "";
}
