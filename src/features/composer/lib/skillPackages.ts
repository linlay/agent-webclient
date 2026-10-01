import { skillDisplayName } from "@/shared/utils/skillDisplayName";
import type { AgentSkill, AgentSkillPackage } from "@/shared/data/api/dto/agents";
import type { ComposerRequiredSkill } from "./composerAttachments";

export const skillIdentity = (id: unknown) => typeof id === "string" ? id.trim().toLowerCase() : "";

export function packageMembers(pkg: AgentSkillPackage, skills: readonly AgentSkill[]) {
  const available = new Map(skills.flatMap(skill => {
    const id = skillIdentity(skill?.id);
    return id ? [[id, skill] as const] : [];
  }));
  const seen = new Set<string>();
  return pkg.skills.flatMap(member => {
    const id = skillIdentity(member?.id);
    const skill = available.get(id);
    if (!id || !skill || seen.has(id)) return [];
    seen.add(id);
    return [skill];
  });
}

/** One manual choice (a skill or a whole package), serialized as concrete skill IDs. */
export function setPackageSelection(current: ComposerRequiredSkill[], members: readonly AgentSkill[], selected: boolean, lockedKeys: readonly string[], selectedViaPackageId?: string) {
  const locked = new Set(lockedKeys.map(skillIdentity));
  const editable = members.filter(member => skillIdentity(member?.id) && !locked.has(skillIdentity(member.id)));
  const ids = new Set(editable.map(skill => skillIdentity(skill.id)));
  const next = current.filter(skill => selected
    ? locked.has(skillIdentity(skill.id))
    : !ids.has(skillIdentity(skill.id)));
  if (selected) next.push(...editable.map(skill => ({ id: skill.id, label: skillDisplayName(skill), ...(selectedViaPackageId ? { selectedViaPackageId } : {}) })));
  const seen = new Set<string>();
  return next.filter(skill => {
    const id = skillIdentity(skill.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function groupSelectedPackages(packages: readonly AgentSkillPackage[], selected: readonly ComposerRequiredSkill[]) {
  const remaining = new Map(selected.map(skill => [skillIdentity(skill.id), skill]));
  const groups = packages.flatMap(pkg => {
    const members: ComposerRequiredSkill[] = [];
    for (const member of pkg.skills) {
      const id = skillIdentity(member?.id);
      const skill = remaining.get(id);
      if (skill?.selectedViaPackageId === pkg.id) { members.push(skill); remaining.delete(id); }
    }
    return members.length ? [{ pkg, members }] : [];
  });
  return { groups, standalone: [...remaining.values()] };
}
