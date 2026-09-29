import { skillDisplayName } from "@/shared/utils/skillDisplayName";
import type { AgentSkill, AgentSkillPackage } from "@/shared/data/api/dto/agents";
import type { ComposerRequiredSkill } from "./composerAttachments";

export const skillIdentity = (key: string) => key.trim().toLowerCase();

export function packageMembers(pkg: AgentSkillPackage, skills: readonly AgentSkill[]) {
  const available = new Map(skills.map(skill => [skillIdentity(skill.key), skill]));
  const seen = new Set<string>();
  return pkg.skills.flatMap(member => {
    const id = skillIdentity(member.id);
    const skill = available.get(id);
    if (!skill || seen.has(id)) return [];
    seen.add(id);
    return [skill];
  });
}

/** Keeps the wire selection as concrete skill IDs, and never removes host-required skills. */
export function setPackageSelection(current: ComposerRequiredSkill[], members: readonly AgentSkill[], selected: boolean, lockedKeys: readonly string[]) {
  const locked = new Set(lockedKeys.map(skillIdentity));
  const editable = members.filter(member => !locked.has(skillIdentity(member.key)));
  const ids = new Set(editable.map(skill => skillIdentity(skill.key)));
  const next = current.filter(skill => !ids.has(skillIdentity(skill.key)));
  if (selected) next.push(...editable.map(skill => ({ key: skill.key, label: skillDisplayName(skill) })));
  const seen = new Set<string>();
  return next.filter(skill => {
    const id = skillIdentity(skill.key);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function groupSelectedPackages(packages: readonly AgentSkillPackage[], selected: readonly ComposerRequiredSkill[]) {
  const remaining = new Map(selected.map(skill => [skillIdentity(skill.key), skill]));
  const groups = packages.flatMap(pkg => {
    const members: ComposerRequiredSkill[] = [];
    for (const member of pkg.skills) {
      const id = skillIdentity(member.id);
      const skill = remaining.get(id);
      if (skill) { members.push(skill); remaining.delete(id); }
    }
    return members.length ? [{ pkg, members }] : [];
  });
  return { groups, standalone: [...remaining.values()] };
}
