import type {
  Agent,
  AppState,
  Chat,
  Team,
  WorkerConversationRow,
  WorkerRow,
} from '../context/types';
import { buildWorkerConversationRows } from './workerConversationFormatter';
import { toText } from './eventUtils';

function toDisplayName(primary: unknown, fallback: unknown): string {
  return toText(primary) || toText(fallback) || '--';
}

function splitTokens(value: string): string[] {
  return value
    .split(/[,\n\uFF0C]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function collectStrings(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') return splitTokens(value);
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return Array.from(new Set(value.flatMap((item) => collectStrings(item)).filter(Boolean)));
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferredKeys = [
      'name',
      'label',
      'key',
      'id',
      'agentKey',
      'teamId',
      'toolName',
      'toolKey',
      'skillName',
      'skillKey',
      'model',
      'modelName',
      'llm',
      'model_id',
      'role',
    ];
    const values = preferredKeys
      .map((key) => record[key])
      .flatMap((item) => collectStrings(item))
      .filter(Boolean);
    return Array.from(new Set(values));
  }
  return [];
}

function collectFromKeys(raw: Record<string, unknown> | null, keys: string[]): string[] {
  if (!raw) return [];
  const values = keys.flatMap((key) => collectStrings(raw[key])).filter(Boolean);
  return Array.from(new Set(values));
}

function findAgentByKey(agents: Agent[], agentKey: string): Agent | null {
  const normalized = toText(agentKey);
  return agents.find((agent) => toText(agent?.key) === normalized) || null;
}

function findTeamById(teams: Team[], teamId: string): Team | null {
  const normalized = toText(teamId);
  return teams.find((team) => toText(team?.teamId) === normalized) || null;
}

function findChatById(chats: Chat[], chatId: string): Chat | null {
  const normalized = toText(chatId);
  return chats.find((chat) => toText(chat?.chatId) === normalized) || null;
}

function resolveWorkerKey(state: Pick<AppState, 'chatId' | 'chats' | 'chatAgentById' | 'workerSelectionKey'>): string {
  const chatId = toText(state.chatId);
  if (chatId) {
    const chat = findChatById(state.chats, chatId);
    const teamId = toText(chat?.teamId);
    if (teamId) return `team:${teamId}`;

    const agentKey = toText(chat?.agentKey || chat?.firstAgentKey || state.chatAgentById.get(chatId));
    if (agentKey) return `agent:${agentKey}`;
  }
  return toText(state.workerSelectionKey);
}

function createFallbackWorkerRow(
  workerKey: string,
  agents: Agent[],
  teams: Team[],
): WorkerRow | null {
  if (!workerKey) return null;

  if (workerKey.startsWith('team:')) {
    const teamId = workerKey.slice('team:'.length);
    const team = findTeamById(teams, teamId);
    return {
      key: workerKey,
      type: 'team',
      sourceId: teamId,
      displayName: toDisplayName(team?.name, teamId),
      role: toText(team?.role) || '--',
      teamAgentLabels: [],
      latestChatId: '',
      latestRunId: '',
      latestUpdatedAt: 0,
      latestChatName: '',
      latestRunContent: '',
      hasHistory: false,
      latestRunSortValue: -1,
      searchText: '',
    };
  }

  if (workerKey.startsWith('agent:')) {
    const agentKey = workerKey.slice('agent:'.length);
    const agent = findAgentByKey(agents, agentKey);
    return {
      key: workerKey,
      type: 'agent',
      sourceId: agentKey,
      displayName: toDisplayName(agent?.name, agentKey),
      role: toText(agent?.role) || '--',
      teamAgentLabels: [],
      latestChatId: '',
      latestRunId: '',
      latestUpdatedAt: 0,
      latestChatName: '',
      latestRunContent: '',
      hasHistory: false,
      latestRunSortValue: -1,
      searchText: '',
    };
  }

  return null;
}

export interface CurrentWorkerSummary {
  key: string;
  type: 'agent' | 'team';
  sourceId: string;
  displayName: string;
  role: string;
  raw: Record<string, unknown> | null;
  row: WorkerRow;
  relatedChats: WorkerConversationRow[];
}

export interface CurrentWorkerDetailView {
  kindLabel: string;
  title: string;
  identifierLabel: string;
  identifierValue: string;
  role: string;
  model: string;
  skills: string[];
  tools: string[];
  members: string[];
  rawJson: string;
}

export function resolveCurrentWorkerSummary(
  state: Pick<
    AppState,
    | 'chatId'
    | 'chats'
    | 'chatAgentById'
    | 'workerSelectionKey'
    | 'workerIndexByKey'
    | 'workerRows'
    | 'workerRelatedChats'
    | 'agents'
    | 'teams'
  >,
): CurrentWorkerSummary | null {
  const workerKey = resolveWorkerKey(state);
  if (!workerKey) return null;

  const row =
    state.workerIndexByKey.get(workerKey)
    || state.workerRows.find((candidate) => candidate.key === workerKey)
    || createFallbackWorkerRow(workerKey, state.agents, state.teams);
  if (!row) return null;

  const raw =
    row.type === 'team'
      ? (findTeamById(state.teams, row.sourceId) as Record<string, unknown> | null)
      : (findAgentByKey(state.agents, row.sourceId) as Record<string, unknown> | null);
  const relatedChats =
    workerKey === toText(state.workerSelectionKey)
      ? state.workerRelatedChats
      : buildWorkerConversationRows({
          chats: state.chats,
          worker: row,
        });

  return {
    key: row.key,
    type: row.type,
    sourceId: row.sourceId,
    displayName: row.displayName,
    role: toText(row.role || raw?.role) || '--',
    raw,
    row,
    relatedChats,
  };
}

export function buildCurrentWorkerDetailView(summary: CurrentWorkerSummary): CurrentWorkerDetailView {
  const raw = summary.raw;
  const model = collectFromKeys(raw, ['model', 'modelName', 'llm', 'model_id'])[0] || '--';
  const skills = collectFromKeys(raw, ['skills', 'skillKeys', 'skillNames']);
  const tools = collectFromKeys(raw, ['tools', 'toolKeys', 'toolNames']);
  const members = summary.type === 'team'
    ? collectFromKeys(raw, ['agentKey', 'agentKeys', 'agents', 'members'])
    : [];
  const fallbackMembers = summary.type === 'team'
    ? summary.row.teamAgentLabels.filter((item) => toText(item) && item !== '--')
    : [];

  return {
    kindLabel: summary.type === 'team' ? '小组' : '员工',
    title: summary.displayName,
    identifierLabel: summary.type === 'team' ? 'teamId' : 'key',
    identifierValue: summary.sourceId,
    role: summary.role || '--',
    model,
    skills,
    tools,
    members: members.length > 0 ? members : fallbackMembers,
    rawJson: raw ? JSON.stringify(raw, null, 2) : '{}',
  };
}

export function buildWorkerSwitchRows(
  rows: WorkerRow[],
  scope: 'all' | 'agent' | 'team',
  searchText: string,
): WorkerRow[] {
  const normalizedSearch = toText(searchText).toLowerCase();
  return rows.filter((row) => {
    if (scope !== 'all' && row.type !== scope) return false;
    if (!normalizedSearch) return true;
    return toText(row.searchText).includes(normalizedSearch);
  });
}

export function buildScheduleDraft(summary: CurrentWorkerSummary, task: string, scheduleRule: string): string {
  const kindLabel = summary.type === 'team' ? '小组' : '员工';
  const roleText = toText(summary.role);
  return [
    `请为当前${kindLabel}制定计划任务。`,
    `对象名称: ${summary.displayName}`,
    `对象标识: ${summary.type === 'team' ? 'teamId' : 'agentKey'}=${summary.sourceId}`,
    `对象角色: ${roleText || '--'}`,
    `任务内容: ${toText(task)}`,
    `执行时间/规则: ${toText(scheduleRule)}`,
    '请先确认时间、触发方式与执行范围，再开始安排。',
  ].join('\n');
}
