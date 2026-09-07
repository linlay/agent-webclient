import type { AgentSkill } from "@/shared/data/api/client";

export function resolveSkillDisplayName(
  skills: readonly AgentSkill[],
  key: string,
  fallbackLabel = "",
): string {
  const normalizedKey = String(key || "").trim().toLowerCase();
  const skillName = skills
    .find(
      (skill) =>
        String(skill.key || "").trim().toLowerCase() === normalizedKey,
    )
    ?.name?.trim();

  return (
    skillName ||
    String(fallbackLabel || "").trim() ||
    String(key || "").trim()
  );
}
