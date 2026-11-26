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

/** Adds one skill, one package member or a whole package to the manual selection; removing takes only those concrete IDs away. */
export function setPackageSelection(current: ComposerRequiredSkill[], members: readonly AgentSkill[], selected: boolean, lockedKeys: readonly string[], selectedViaPackageId?: string) {
  const locked = new Set(lockedKeys.map(skillIdentity));
  const editable = members.filter(member => skillIdentity(member?.id) && !locked.has(skillIdentity(member.id)));
  const ids = new Set(editable.map(skill => skillIdentity(skill.id)));
  const next = selected
    ? current.map(skill => {
        const id = skillIdentity(skill.id);
        return selectedViaPackageId && ids.has(id) ? { ...skill, selectedViaPackageId } : skill;
      })
    : current.filter(skill => !ids.has(skillIdentity(skill.id)));
  if (selected) {
    const existing = new Set(next.map(skill => skillIdentity(skill.id)));
    next.push(...editable
      .filter(skill => !existing.has(skillIdentity(skill.id)))
      .map(skill => ({ id: skill.id, label: skillDisplayName(skill), ...(selectedViaPackageId ? { selectedViaPackageId } : {}) })));
  }
  const seen = new Set<string>();
  return next.filter(skill => {
    const id = skillIdentity(skill.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Clicking a selected skill removes it; clicking any other skill appends it to the current manual selection. */
export function toggleSkillSelection(current: ComposerRequiredSkill[], skill: AgentSkill, lockedKeys: readonly string[]) {
  const locked = new Set(lockedKeys.map(skillIdentity));
  const identity = skillIdentity(skill?.id);
  if (!identity || locked.has(identity)) return current;
  const selected = current.some(item => skillIdentity(item.id) === identity);
  return setPackageSelection(current, [skill], !selected, lockedKeys);
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
