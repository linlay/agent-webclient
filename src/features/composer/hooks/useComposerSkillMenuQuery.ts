import { useEffect } from "react";
import { invalidateAgentSkills } from "@/shared/data/api/routedClient";
import { useAgentSkillsQuery } from "@/shared/data/query/queries";

/** Menu activation owns refresh timing; non-menu consumers keep normal caching. */
export function useComposerSkillMenuQuery(
  agentKey: string,
  options: { enabled?: boolean } = {},
) {
  const normalizedAgentKey = agentKey.trim();
  const enabled = options.enabled !== false && Boolean(normalizedAgentKey);
  const query = useAgentSkillsQuery(normalizedAgentKey, { enabled: false });
  const { invalidate, refetch } = query;

  useEffect(() => {
    if (!enabled) return;
    // Invalidate both cache layers once per opening, not on each search input.
    invalidateAgentSkills(normalizedAgentKey);
    invalidate();
    void refetch().catch(() => undefined);
  }, [enabled, normalizedAgentKey, invalidate, refetch]);

  return query;
}
