import type { Agent, Chat, Team, WorkerListItem } from '@/app/state/types';
import { mergeFetchedChats } from '@/features/chats/lib/chatSummary';

export type WorkerDataSnapshot = {
  agents: Agent[];
  teams: Team[];
  chats: Chat[];
  workerOrderKeys: string[];
  workerSelectionKey: string;
  workerPriorityKey: string;
};

export type WorkerRefreshOverrides = Partial<WorkerDataSnapshot>;

interface WorkerRefreshCoordinatorOptions {
  fetchAgents: () => Promise<Agent[]>;
  fetchTeams: () => Promise<Team[]>;
  fetchChats: () => Promise<Chat[]>;
  getSnapshot: () => WorkerDataSnapshot;
  applyAgents: (agents: Agent[]) => void;
  applyTeams: (teams: Team[]) => void;
  applyChats: (chats: Chat[]) => void;
  rebuildWorkerRows: (overrides: WorkerRefreshOverrides) => void;
  appendDebug: (line: string) => void;
}

interface WorkerRefreshFromAgentsOptions {
  fetchAgents: () => Promise<WorkerListItem[]>;
  getSnapshot: () => WorkerDataSnapshot;
  applyAgents: (agents: Agent[]) => void;
  applyTeams: (teams: Team[]) => void;
  applyWorkerOrderKeys: (workerOrderKeys: string[]) => void;
  applyChats: (chats: Chat[]) => void;
  rebuildWorkerRows: (overrides: WorkerRefreshOverrides) => void;
  appendDebug: (line: string) => void;
}

type SettledListResult<T> = PromiseSettledResult<T[]>;

function settledValueOrFallback<T>(
  result: SettledListResult<T>,
  fallback: T[],
  onRejected: (message: string) => void,
): T[] {
  if (result.status === 'fulfilled') {
    return Array.isArray(result.value) ? result.value : [];
  }
  onRejected(result.reason instanceof Error ? result.reason.message : String(result.reason || 'unknown error'));
  return fallback;
}

export type WorkerListSnapshot = {
  agents: Agent[];
  teams: Team[];
  chats: Chat[];
  workerOrderKeys: string[];
};

function readText(value: unknown): string {
  return String(value || '').trim();
}

function isTeamListItem(item: WorkerListItem): item is Team {
  return readText(item?.kind) === 'team';
}

function extractChatsFromWorker(
  worker: Agent | Team,
  owner: { type: 'agent'; sourceId: string } | { type: 'team'; sourceId: string },
): Chat[] {
  const chats: Chat[] = [];
  const workerChats = Array.isArray(worker?.chats) ? worker.chats : [];
  for (const rawChat of workerChats) {
    if (!rawChat || typeof rawChat !== 'object') continue;
    const chat = rawChat as Chat;
    const chatId = readText(chat.chatId);
    if (!chatId) continue;
    const hasExplicitPendingAwaiting = Object.prototype.hasOwnProperty.call(
      chat,
      'hasPendingAwaiting',
    );
    const nextChat: Chat = {
      ...chat,
      chatId,
      ...(owner.type === 'team'
        ? { teamId: readText(chat.teamId) || owner.sourceId || undefined }
        : {
            agentKey:
              readText(chat.agentKey || chat.firstAgentKey) || owner.sourceId || undefined,
          }),
    };
    if (hasExplicitPendingAwaiting) {
      nextChat.hasPendingAwaiting = chat.hasPendingAwaiting;
    } else if (chat.awaiting) {
      nextChat.hasPendingAwaiting = true;
    }
    chats.push(nextChat);
  }
  return chats;
}

export function splitWorkerListItems(items: WorkerListItem[]): WorkerListSnapshot {
  const agents: Agent[] = [];
  const teams: Team[] = [];
  const chats: Chat[] = [];
  const workerOrderKeys: string[] = [];

  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== 'object') continue;

    if (isTeamListItem(item)) {
      const teamId = readText(item.teamId);
      if (!teamId) continue;
      teams.push(item);
      workerOrderKeys.push(`team:${teamId}`);
      chats.push(...extractChatsFromWorker(item, { type: 'team', sourceId: teamId }));
      continue;
    }

    const agent = item as Agent;
    const agentKey = readText(agent.key);
    if (!agentKey) continue;
    agents.push(agent);
    workerOrderKeys.push(`agent:${agentKey}`);
    chats.push(...extractChatsFromWorker(agent, { type: 'agent', sourceId: agentKey }));
  }

  return { agents, teams, chats, workerOrderKeys };
}

export function extractChatsFromAgents(agents: Agent[]): Chat[] {
  return splitWorkerListItems(agents).chats;
}

export async function refreshWorkerDataFromAgentsWithChats(
  options: WorkerRefreshFromAgentsOptions,
): Promise<void> {
  try {
    const items = await options.fetchAgents();
    const current = options.getSnapshot();
    const next = splitWorkerListItems(items);
    const fetchedChats = next.chats;
    const nextChats = mergeFetchedChats(current.chats, fetchedChats);

    options.applyAgents(next.agents);
    options.applyTeams(next.teams);
    options.applyWorkerOrderKeys(next.workerOrderKeys);
    options.applyChats(nextChats);
    options.rebuildWorkerRows({
      agents: next.agents,
      teams: next.teams,
      chats: nextChats,
      workerOrderKeys: next.workerOrderKeys,
      workerSelectionKey: current.workerSelectionKey,
      workerPriorityKey: current.workerPriorityKey,
    });
  } catch (error) {
    options.appendDebug(`[loadAgents error] ${error instanceof Error ? error.message : String(error || 'unknown error')}`);
  }
}

export async function refreshWorkerDataWithCoordinator(
  options: WorkerRefreshCoordinatorOptions,
): Promise<void> {
  const agentsPromise = options.fetchAgents();
  const teamsPromise = options.fetchTeams();
  const chatsPromise = options.fetchChats();

  const [agentsResult, teamsResult, chatsResult] = await Promise.allSettled([
    agentsPromise,
    teamsPromise,
    chatsPromise,
  ]) as [SettledListResult<Agent>, SettledListResult<Team>, SettledListResult<Chat>];

  const current = options.getSnapshot();
  const nextAgents = settledValueOrFallback(agentsResult, current.agents, (message) => {
    options.appendDebug(`[loadAgents error] ${message}`);
  });
  const nextTeams = settledValueOrFallback(teamsResult, current.teams, (message) => {
    options.appendDebug(`[loadTeams error] ${message}`);
  });
  const fetchedChats = settledValueOrFallback(chatsResult, current.chats, (message) => {
    options.appendDebug(`[loadChats error] ${message}`);
  });
  const nextChats = mergeFetchedChats(current.chats, fetchedChats);

  if (agentsResult.status === 'fulfilled') {
    options.applyAgents(nextAgents);
  }
  if (teamsResult.status === 'fulfilled') {
    options.applyTeams(nextTeams);
  }
  if (chatsResult.status === 'fulfilled') {
    options.applyChats(nextChats);
  }

  if (
    agentsResult.status === 'fulfilled'
    || teamsResult.status === 'fulfilled'
    || chatsResult.status === 'fulfilled'
  ) {
    options.rebuildWorkerRows({
      agents: nextAgents,
      teams: nextTeams,
      chats: nextChats,
      workerSelectionKey: current.workerSelectionKey,
      workerPriorityKey: current.workerPriorityKey,
    });
  }
}
