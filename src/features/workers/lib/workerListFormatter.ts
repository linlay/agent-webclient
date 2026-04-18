import type { Agent, Chat, Team, WorkerRow } from '@/app/state/types';
import { toText } from '@/shared/utils/eventUtils';
import { readTeamAgentKeys } from '@/features/workers/lib/teamUtils';

function toDisplayName(name: unknown, fallback: unknown): string {
  const normalizedName = toText(name);
  if (normalizedName) return normalizedName;
  return toText(fallback) || 'n/a';
}

function toRunSortValue(lastRunId: unknown): number {
  const normalized = toText(lastRunId).toLowerCase();
  if (!normalized) return -1;
  const parsed = Number.parseInt(normalized, 36);
  return Number.isFinite(parsed) ? parsed : -1;
}

function normalizeUpdatedAt(updatedAt: unknown): number {
  const numeric = Number(updatedAt);
  return Number.isFinite(numeric) ? numeric : 0;
}

function createAgentNameMap(agents: Agent[]): Map<string, string> {
  const nameByKey = new Map<string, string>();
  for (const agent of Array.isArray(agents) ? agents : []) {
    const key = toText(agent?.key);
    if (!key) continue;
    nameByKey.set(key, toDisplayName(agent?.name, key));
  }
  return nameByKey;
}

function toTeamAgentLabels(team: Team, agentNameByKey: Map<string, string>): string[] {
  const keys = readTeamAgentKeys(team);
  if (keys.length === 0) return ['--'];
  return keys.slice(0, 2).map((key) => toText(agentNameByKey.get(key)) || key);
}

export function createWorkerKeyFromChat(chat: Chat): string {
  const teamId = toText(chat?.teamId);
  if (teamId) return `team:${teamId}`;

  const agentKey = toText(chat?.agentKey || chat?.firstAgentKey);
  if (agentKey) return `agent:${agentKey}`;

  return '';
}

function compareChatFreshness(a: Chat, b: Chat): number {
  const updatedA = normalizeUpdatedAt(a?.updatedAt);
  const updatedB = normalizeUpdatedAt(b?.updatedAt);
  if (updatedA !== updatedB) return updatedB - updatedA;

  const chatA = toText(a?.chatId);
  const chatB = toText(b?.chatId);
  return chatA.localeCompare(chatB);
}

function toLatestChatMap(chats: Chat[]): Map<string, Chat> {
  const latestByWorker = new Map<string, Chat>();
  for (const chat of Array.isArray(chats) ? chats : []) {
    const workerKey = createWorkerKeyFromChat(chat);
    if (!workerKey) continue;

    const current = latestByWorker.get(workerKey);
    if (!current || compareChatFreshness(chat, current) < 0) {
      latestByWorker.set(workerKey, chat);
    }
  }
  return latestByWorker;
}

function createBaseWorkerMap(agents: Agent[], teams: Team[]): Map<string, Omit<WorkerRow, 'latestChatId' | 'latestRunId' | 'latestUpdatedAt' | 'latestChatName' | 'latestRunContent' | 'hasHistory' | 'latestRunSortValue' | 'searchText'>> {
  const workersByKey = new Map<string, Omit<WorkerRow, 'latestChatId' | 'latestRunId' | 'latestUpdatedAt' | 'latestChatName' | 'latestRunContent' | 'hasHistory' | 'latestRunSortValue' | 'searchText'>>();
  const agentNameByKey = createAgentNameMap(agents);

  for (const team of Array.isArray(teams) ? teams : []) {
    const teamId = toText(team?.teamId);
    if (!teamId) continue;
    workersByKey.set(`team:${teamId}`, {
      key: `team:${teamId}`,
      type: 'team',
      sourceId: teamId,
      displayName: toDisplayName(team?.name, teamId),
      role: toText(team?.role) || '--',
      teamAgentLabels: toTeamAgentLabels(team, agentNameByKey),
    });
  }

  for (const agent of Array.isArray(agents) ? agents : []) {
    const agentKey = toText(agent?.key);
    if (!agentKey) continue;
    workersByKey.set(`agent:${agentKey}`, {
      key: `agent:${agentKey}`,
      type: 'agent',
      sourceId: agentKey,
      displayName: toDisplayName(agent?.name, agentKey),
      role: toText(agent?.role) || '--',
      teamAgentLabels: [],
    });
  }

  return workersByKey;
}

function buildSearchText(row: WorkerRow): string {
  return [
    row.displayName,
    row.role,
    row.sourceId,
    row.latestChatId,
    row.latestChatName,
    row.latestRunId,
    row.latestRunContent,
    ...(Array.isArray(row.teamAgentLabels) ? row.teamAgentLabels : []),
  ]
    .map((value) => toText(value).toLowerCase())
    .join(' ');
}

function toWorkerRow(base: Omit<WorkerRow, 'latestChatId' | 'latestRunId' | 'latestUpdatedAt' | 'latestChatName' | 'latestRunContent' | 'hasHistory' | 'latestRunSortValue' | 'searchText'>, latestChat?: Chat): WorkerRow {
  const latestChatId = toText(latestChat?.chatId);
  const latestRunId = toText(latestChat?.lastRunId);
  const latestRunSortValue = toRunSortValue(latestRunId);
  const hasHistory = Boolean(latestChatId) && latestRunSortValue >= 0;

  const row: WorkerRow = {
    ...base,
    latestChatId: hasHistory ? latestChatId : '',
    latestRunId: hasHistory ? latestRunId : '',
    latestUpdatedAt: hasHistory ? normalizeUpdatedAt(latestChat?.updatedAt) : 0,
    latestChatName: hasHistory ? toText(latestChat?.chatName) : '',
    latestRunContent: hasHistory ? toText(latestChat?.lastRunContent) : '',
    hasHistory,
    latestRunSortValue: hasHistory ? latestRunSortValue : -1,
    searchText: '',
  };
  row.searchText = buildSearchText(row);
  return row;
}

function compareWorkerRows(a: WorkerRow, b: WorkerRow): number {
  if (a.latestUpdatedAt !== b.latestUpdatedAt) return b.latestUpdatedAt - a.latestUpdatedAt;
  const displayNameComparison = a.displayName.localeCompare(b.displayName);
  if (displayNameComparison !== 0) return displayNameComparison;
  return a.key.localeCompare(b.key);
}

export function buildWorkerRows(input: { agents: Agent[]; teams: Team[]; chats: Chat[]; workerPriorityKey?: string }): WorkerRow[] {
  const latestByWorker = toLatestChatMap(input.chats);
  const workersByKey = createBaseWorkerMap(input.agents, input.teams);

  for (const [workerKey, chat] of latestByWorker.entries()) {
    if (workersByKey.has(workerKey)) continue;

    if (workerKey.startsWith('team:')) {
      const teamId = workerKey.slice('team:'.length);
      workersByKey.set(workerKey, {
        key: workerKey,
        type: 'team',
        sourceId: teamId,
        displayName: teamId,
        role: '--',
        teamAgentLabels: ['--'],
      });
      continue;
    }

    if (workerKey.startsWith('agent:')) {
      const agentKey = workerKey.slice('agent:'.length);
      workersByKey.set(workerKey, {
        key: workerKey,
        type: 'agent',
        sourceId: agentKey,
        displayName: agentKey,
        role: '--',
        teamAgentLabels: [],
      });
    }
  }

  const rows: WorkerRow[] = [];
  for (const [key, base] of workersByKey.entries()) {
    rows.push(toWorkerRow(base, latestByWorker.get(key)));
  }

  rows.sort(compareWorkerRows);
  return rows;
}
