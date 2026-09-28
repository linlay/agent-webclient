import { skillDisplayName } from "@/shared/utils/skillDisplayName";
import type { AgentSkill } from "@/shared/data/api/client";

export function resolveSkillDisplayName(
  skills: readonly AgentSkill[],
  key: string,
  fallbackLabel = "",
): string {
  const normalizedKey = String(key || "").trim().toLowerCase();
  const skill = skills
    .find(
      (skill) =>
        String(skill.key || "").trim().toLowerCase() === normalizedKey,
    );

  return (
    (skill ? skillDisplayName(skill) : "") ||
    String(fallbackLabel || "").trim() ||
    String(key || "").trim()
  );
}
