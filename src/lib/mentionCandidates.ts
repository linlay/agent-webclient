import type { Agent, AppState, Team } from '../context/types';
import { toText } from './eventUtils';
import { readTeamAgentKeys } from './teamUtils';

function normalizeAgents(agents: Agent[]): Array<{ key: string; name: string; role: string }> {
  if (!Array.isArray(agents)) return [];
  return agents
    .map((item) => ({
      key: toText(item?.key),
      name: toText(item?.name),
      role: toText(item?.role),
    }))
    .filter((item) => item.key);
}

function resolveTeamById(teams: Team[], teamId: string): Team | null {
  const normalizedTeamId = toText(teamId);
  if (!normalizedTeamId) return null;
  for (const item of Array.isArray(teams) ? teams : []) {
    if (toText(item?.teamId) === normalizedTeamId) return item;
  }
  return null;
}

export function resolveMentionCandidatesFromState(state: AppState): Agent[] {
  const allAgents = normalizeAgents(state?.agents);
  const mode = toText(state?.conversationMode) || 'chat';

  if (mode !== 'worker') return allAgents as Agent[];
  if (!(state?.workerIndexByKey instanceof Map)) return allAgents as Agent[];

  const selectedWorker = state.workerIndexByKey.get(toText(state?.workerSelectionKey));
  if (!selectedWorker) return allAgents as Agent[];

  if (toText(selectedWorker.type) === 'agent') return [];
  if (toText(selectedWorker.type) !== 'team') return allAgents as Agent[];

  const team = resolveTeamById(state?.teams, selectedWorker.sourceId);
  if (!team) return [];

  const teamAgentKeys = readTeamAgentKeys(team);
  if (teamAgentKeys.length === 0) return [];

  const agentsByKey = new Map(allAgents.map((item) => [item.key, item]));
  return teamAgentKeys.map((key) => agentsByKey.get(key) || { key, name: key, role: '--' }) as Agent[];
}
