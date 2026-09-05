import type { Agent } from '@/app/state/types';
import { toText } from '@/shared/utils/eventUtils';

export function buildAgentOrderSearchText(agent: Agent): string {
  return [agent.key, agent.name, agent.role, agent.description, ...(Array.isArray(agent.wonders) ? agent.wonders : [])]
    .map((item) => toText(item).toLowerCase())
    .join(' ');
}

export function filterAgentsPreservingOrder(agents: Agent[], query: string): Agent[] {
  const normalizedQuery = toText(query).toLowerCase();
  const normalizedAgents = Array.isArray(agents) ? agents : [];
  if (!normalizedQuery) return normalizedAgents;
  return normalizedAgents.filter((agent) => buildAgentOrderSearchText(agent).includes(normalizedQuery));
}

export function moveAgentForDrop(agents: Agent[], sourceKey: string, targetKey: string): Agent[] {
  if (!sourceKey || !targetKey || sourceKey === targetKey) return agents;
  const sourceIndex = agents.findIndex((agent) => toText(agent.key) === sourceKey);
  const targetIndex = agents.findIndex((agent) => toText(agent.key) === targetKey);
  if (sourceIndex < 0 || targetIndex < 0) return agents;
  const next = agents.slice();
  const [source] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, source);
  return next;
}

export function agentOrderPayload(agents: Agent[]): string[] {
  return (Array.isArray(agents) ? agents : []).map((agent) => toText(agent.key)).filter(Boolean);
}
