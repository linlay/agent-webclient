import type { Agent, Chat, Team, WorkerRow } from '@/app/state/types';
import { toText } from '@/shared/utils/eventUtils';
import { readTeamAgentKeys } from '@/features/workers/lib/teamUtils';
import { readEpochMillis } from '@/shared/utils/platformTime';

function toDisplayName(name: unknown, fallback: unknown): string {
  if (name !== undefined && name !== null) return toText(name);
  const normalizedName = toText(name);
  if (normalizedName) return normalizedName;
  return toText(fallback) || 'n/a';
}

function normalizeUpdatedAt(updatedAt: unknown): number {
  return readEpochMillis(updatedAt) ?? 0;
}

function normalizeAgentType(type: unknown, mode?: unknown): 'agent' | 'coder' | 'kbase' {
  if (type === 'coder') return 'coder';
  const upperMode = toText(mode).toUpperCase();
  if (upperMode === 'CODER') return 'coder';
  if (upperMode === 'KBASE') return 'kbase';
  return 'agent';
}

function normalizeSourceKind(source: unknown): string {
  return source && typeof source === 'object' && !Array.isArray(source)
    ? toText((source as { kind?: unknown }).kind)
    : '';
}

function normalizeWorkspaceDir(workspaceDir: unknown): string | undefined {
  const normalized = toText(workspaceDir);
  if (!normalized || normalized.startsWith('@')) return undefined;
  return normalized;
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

function toLatestChatMap(chats: Chat[]): Map<string, Chat> {
  const latestByWorker = new Map<string, Chat>();
  for (const chat of Array.isArray(chats) ? chats : []) {
    const workerKey = createWorkerKeyFromChat(chat);
    if (!workerKey || latestByWorker.has(workerKey)) continue;
    latestByWorker.set(workerKey, chat);
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
      agentType: normalizeAgentType(agent?.type, agent?.mode),
      sourceId: agentKey,
      displayName: toDisplayName(agent?.name, agentKey),
      role: toText(agent?.role),
      workspaceDir: normalizeWorkspaceDir(agent?.workspaceDir),
      workspaceName: toText(agent?.workspaceName) || undefined,
      workspaceSourceKind: normalizeSourceKind(agent?.source) || undefined,
      teamAgentLabels: [],
    });
  }

  return workersByKey;
}

function buildSearchText(row: WorkerRow): string {
  return [
    row.displayName,
    row.role,
    row.agentType,
    row.workspaceDir,
    row.workspaceName,
    row.workspaceSourceKind,
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
  const hasHistory = Boolean(latestChatId);

  const row: WorkerRow = {
    ...base,
    latestChatId: hasHistory ? latestChatId : '',
    latestRunId: hasHistory ? latestRunId : '',
    latestUpdatedAt: hasHistory ? normalizeUpdatedAt(latestChat?.updatedAt) : 0,
    latestChatName: hasHistory ? toText(latestChat?.chatName) : '',
    latestRunContent: hasHistory ? toText(latestChat?.lastRunContent) : '',
    hasHistory,
    latestRunSortValue: hasHistory ? 0 : -1,
    searchText: '',
  };
  row.searchText = buildSearchText(row);
  return row;
}

function compareWorkerRows(
  a: WorkerRow,
  b: WorkerRow,
  workerOrderByKey: Map<string, number>,
): number {
  const orderA = workerOrderByKey.get(a.key);
  const orderB = workerOrderByKey.get(b.key);
  const hasOrderA = orderA !== undefined;
  const hasOrderB = orderB !== undefined;
  if (hasOrderA && hasOrderB) return orderA - orderB;
  if (hasOrderA !== hasOrderB) return hasOrderA ? -1 : 1;

  const displayNameComparison = a.displayName.localeCompare(b.displayName);
  if (displayNameComparison !== 0) return displayNameComparison;
  return a.key.localeCompare(b.key);
}

export function buildWorkerRows(input: {
  agents: Agent[];
  teams: Team[];
  chats: Chat[];
  workerOrderKeys?: string[];
  workerPriorityKey?: string;
}): WorkerRow[] {
  const latestByWorker = toLatestChatMap(input.chats);
  const workersByKey = createBaseWorkerMap(input.agents, input.teams);
  const workerOrderByKey = new Map(
    (Array.isArray(input.workerOrderKeys) ? input.workerOrderKeys : [])
      .map((key, index) => [toText(key), index] as const)
      .filter(([key]) => Boolean(key)),
  );

  const rows: WorkerRow[] = [];
  for (const [key, base] of workersByKey.entries()) {
    rows.push(toWorkerRow(base, latestByWorker.get(key)));
  }

  rows.sort((a, b) => compareWorkerRows(a, b, workerOrderByKey));
  return rows;
}
