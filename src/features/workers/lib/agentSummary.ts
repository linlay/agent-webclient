import type { Agent } from '@/app/state/types';

export type AgentSummaryPatch = Partial<Agent> & Pick<Agent, 'key'>;

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

export function mergeAgentSummary(
  existing: Agent | undefined,
  patch: AgentSummaryPatch,
): Agent {
  const hasPatchName = hasOwn(patch, 'name') && patch.name !== undefined;
  const hasExistingName = existing != null && hasOwn(existing, 'name') && existing.name !== undefined;
  let name = patch.key;
  if (hasExistingName) {
    name = existing.name;
  }
  if (hasPatchName) {
    name = patch.name as string;
  }
  const next: Agent = {
    ...(existing || {}),
    key: patch.key,
    name,
  };

  for (const [key, value] of Object.entries(patch)) {
    if ((key === 'key' || key === 'name') || !hasOwn(patch, key) || value === undefined) {
      continue;
    }
    next[key] = value;
  }

  return next;
}

export function upsertAgentSummary(
  agents: Agent[],
  patch: AgentSummaryPatch,
): Agent[] {
  const currentAgents = Array.isArray(agents) ? agents : [];
  const existingIndex = currentAgents.findIndex(
    (agent) => String(agent?.key || '') === String(patch.key || ''),
  );
  const existing = existingIndex >= 0 ? currentAgents[existingIndex] : undefined;
  const merged = mergeAgentSummary(existing, patch);

  if (existingIndex < 0) {
    return [...currentAgents, merged];
  }

  return currentAgents.map((agent, index) => (
    index === existingIndex ? merged : agent
  ));
}
