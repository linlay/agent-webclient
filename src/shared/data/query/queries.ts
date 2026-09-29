import { dataEndpoints } from "@/shared/data/api/endpoints";
import { useDataQuery } from "@/shared/data/query/serverState";
import { getAgentSkills } from "@/shared/data/api/routedClient";
import { useMemo } from "react";
import { useI18n } from "@/shared/i18n";

export function useAgentSkillsQuery(
  agentKey: string,
  options: { enabled?: boolean } = {},
) {
  const { locale } = useI18n();
  const endpoint = useMemo(() => ({
    ...dataEndpoints.agentSkills,
    key: `${dataEndpoints.agentSkills.key}:${locale}`,
  }), [locale]);
  const normalizedAgentKey = String(agentKey || "").trim();
  return useDataQuery(
    endpoint,
    normalizedAgentKey,
    getAgentSkills,
    { enabled: options.enabled !== false && Boolean(normalizedAgentKey) },
  );
}
