import { skillDisplayName } from "@/shared/utils/skillDisplayName";
import type { AgentSkill } from "@/shared/data/api/client";

export function resolveSkillDisplayName(
  skills: readonly AgentSkill[],
  id: string,
  fallbackLabel = "",
): string {
  const normalizedId = String(id || "").trim().toLowerCase();
  const skill = skills
    .find(
      (skill) =>
        String(skill.id || "").trim().toLowerCase() === normalizedId,
    );

  return (
    (skill ? skillDisplayName(skill) : "") ||
    String(fallbackLabel || "").trim() ||
    String(id || "").trim()
  );
}
