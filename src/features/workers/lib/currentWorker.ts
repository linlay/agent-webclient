import type { Agent } from "@/features/agents/lib/agentState";
import type { AppState } from "@/app/state/AppContext";
import type { Chat } from "@/features/chats/lib/chatState";
import type { Team, WorkerConversationRow, WorkerRow } from "@/features/workers/lib/workerState";
import { buildWorkerConversationRows } from '@/features/workers/lib/workerConversationFormatter';
import { toText } from '@/shared/utils/eventUtils';

function toDisplayName(primary: unknown, fallback: unknown): string {
  return toText(primary) || toText(fallback) || '--';
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

export function isDedicatedKbaseWorker(
  worker: CurrentWorkerSummary | null | undefined,
): boolean {
  return (
    worker?.type === "agent" &&
    toText(worker.raw?.mode).toUpperCase() === "KBASE"
  );
}

export function supportsActiveRunContextCompact(
  worker: CurrentWorkerSummary | null | undefined,
): boolean {
  if (!worker || worker.type === "team") return true;
  const mode = toText(worker.raw?.mode).toUpperCase().replace(/-/g, "_");
  if (mode === "PROXY" || mode === "CHANNEL" || mode === "ACP_PROXY") {
    return false;
  }
  const definition = worker.raw?.definition as Record<string, unknown> | undefined;
  const runtimeConfig = (definition?.runtimeConfig || worker.raw?.runtimeConfig) as
    | Record<string, unknown>
    | undefined;
  return !toText(runtimeConfig?.acpBridgeId);
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

export function isCoderAgent(summary: CurrentWorkerSummary | null): boolean {
  if (!summary || summary.type !== 'agent') return false;
  return String((summary.raw as Record<string, unknown> | null)?.['mode'] || '').toUpperCase() === 'CODER';
}
