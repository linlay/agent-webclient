import type { Team } from '@/app/state/types';
import { toText } from '@/shared/utils/eventUtils';

function pushTeamAgentKeys(raw: unknown, keys: string[], seen: Set<string>): void {
  const normalized = toText(raw);
  if (!normalized) return;
  const parts = normalized
    .split(/[,\uFF0C]/)
    .map((part) => toText(part))
    .filter(Boolean);
  for (const key of parts) {
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
}

export function readTeamAgentKeys(team: Team): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const candidates: unknown[] = [];
  candidates.push(team?.agentKey);

  if (Array.isArray(team?.agentKeys)) {
    candidates.push(...team.agentKeys);
  }

  for (const item of Array.isArray(team?.agents) ? team.agents : []) {
    if (typeof item === 'string') {
      candidates.push(item);
    } else {
      candidates.push(item?.agentKey, item?.key);
    }
  }

  for (const item of Array.isArray(team?.members) ? team.members : []) {
    if (typeof item === 'string') {
      candidates.push(item);
    } else {
      candidates.push(item?.agentKey, item?.key);
    }
  }

  for (const candidate of candidates) {
    pushTeamAgentKeys(candidate, keys, seen);
  }
  return keys;
}
