/** Display metadata is localized by Platform; identity always remains the id. */
export function skillDisplayName(skill: { displayName?: string; name?: string; id?: string }): string {
  return skill.displayName?.trim() || skill.name?.trim() || "";
}

/** Platform localizes package displayName; name is the stable manifest identity. */
export function skillPackageDisplayName(pack: { displayName?: string; name?: string; id: string }): string {
  return pack.displayName?.trim() || pack.name?.trim() || "";
}
