import { usePinnedSkills } from "@/features/skills/hooks/usePinnedSkills";

/** Agent context only annotates configured skills; the catalog is global. */
export function useComposerSkillMenuQuery(
  agentKey: string,
  options: { enabled?: boolean } = {},
) {
  const normalizedAgentKey = agentKey.trim();
  return usePinnedSkills(options.enabled !== false && Boolean(normalizedAgentKey), normalizedAgentKey);
}
