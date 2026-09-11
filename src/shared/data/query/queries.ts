import { dataEndpoints } from "@/shared/data/api/endpoints";
import { useDataQuery } from "@/shared/data/query/serverState";
import { getAgentSkills } from "@/shared/data/api/routedClient";

export function useAgentSkillsQuery(
  agentKey: string,
  options: { enabled?: boolean } = {},
) {
  const normalizedAgentKey = String(agentKey || "").trim();
  return useDataQuery(
    dataEndpoints.agentSkills,
    normalizedAgentKey,
    getAgentSkills,
    { enabled: options.enabled !== false && Boolean(normalizedAgentKey) },
  );
}
