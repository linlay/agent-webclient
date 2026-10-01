import { skillDisplayName, skillPackageDisplayName } from "@/shared/utils/skillDisplayName";
import type { AdminSkillPackageSummary, AdminSkillSummary } from "@/shared/data/api/dto/skills";

export function groupAdminSkills(
  skills: AdminSkillSummary[],
  packages: AdminSkillPackageSummary[],
  searchText: string,
  status: string,
) {
  const needle = searchText.trim().toLowerCase();
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const owned = new Set(packages.flatMap((pack) => pack.skills.map((member) => member.id)));
  const matchesStatus = (skill: AdminSkillSummary) => status === "all" || skill.status === status;
  const matchesText = (skill: AdminSkillSummary) =>
    [skill.id, skill.name, skillDisplayName(skill), skill.description, skill.source?.path].join(" ").toLowerCase().includes(needle);
  return {
    packages: packages.map((pack) => {
      const packageMatches = [pack.id, pack.name, skillPackageDisplayName(pack), pack.description].join(" ").toLowerCase().includes(needle);
      const members = pack.skills.filter((member) => {
        const skill = byId.get(member.id);
        return skill
          ? matchesStatus(skill) && (packageMatches || matchesText(skill))
          : (status === "all" || status === "invalid") && (packageMatches || member.id.toLowerCase().includes(needle));
      }).map((member) => ({ ...member, skill: byId.get(member.id) }));
      return { pack, members, packageMatches };
    }).filter(({ pack, members, packageMatches }) => members.length > 0 || (packageMatches && status === "all" && pack.skills.length === 0)).map(({ pack, members }) => ({ pack, members })),
    standalone: skills.filter((skill) => !skill.packageId && !owned.has(skill.id) && matchesStatus(skill) && matchesText(skill)),
  };
}
