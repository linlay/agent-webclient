import type { Agent, Chat, Team } from '@/app/state/types';
import { mergeFetchedChats } from '@/features/chats/lib/chatSummary';

export type WorkerDataSnapshot = {
  agents: Agent[];
  teams: Team[];
  chats: Chat[];
  workerSelectionKey: string;
  workerPriorityKey: string;
};

export type WorkerRefreshOverrides = Partial<WorkerDataSnapshot>;
export type WorkerRowBuildOptions = {
  allowUnknownAgentRows?: boolean;
};

interface WorkerRefreshCoordinatorOptions {
  fetchAgents: () => Promise<Agent[]>;
  fetchTeams: () => Promise<Team[]>;
  fetchChats: () => Promise<Chat[]>;
  getSnapshot: () => WorkerDataSnapshot;
  applyAgents: (agents: Agent[]) => void;
  applyTeams: (teams: Team[]) => void;
  applyChats: (chats: Chat[]) => void;
  rebuildWorkerRows: (overrides: WorkerRefreshOverrides & WorkerRowBuildOptions) => void;
  appendDebug: (line: string) => void;
}

interface WorkerRefreshFromAgentsOptions {
  fetchAgents: () => Promise<Agent[]>;
  getSnapshot: () => WorkerDataSnapshot;
  applyAgents: (agents: Agent[]) => void;
  applyChats: (chats: Chat[]) => void;
  rebuildWorkerRows: (overrides: WorkerRefreshOverrides & WorkerRowBuildOptions) => void;
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

export function extractChatsFromAgents(agents: Agent[]): Chat[] {
  const chats: Chat[] = [];
  for (const agent of Array.isArray(agents) ? agents : []) {
    const agentKey = String(agent?.key || '').trim();
    const agentChats = Array.isArray(agent?.chats) ? agent.chats : [];
    for (const rawChat of agentChats) {
      if (!rawChat || typeof rawChat !== 'object') continue;
      const chat = rawChat as Chat;
      const chatId = String(chat.chatId || '').trim();
      if (!chatId) continue;
      const hasExplicitPendingAwaiting = Object.prototype.hasOwnProperty.call(
        chat,
        'hasPendingAwaiting',
      );
      const nextChat: Chat = {
        ...chat,
        chatId,
        agentKey: String(chat.agentKey || chat.firstAgentKey || '').trim() || agentKey || undefined,
      };
      if (hasExplicitPendingAwaiting) {
        nextChat.hasPendingAwaiting = chat.hasPendingAwaiting;
      } else if (chat.awaiting) {
        nextChat.hasPendingAwaiting = true;
      }
      chats.push(nextChat);
    }
  }
  return chats;
}

export async function refreshWorkerDataFromAgentsWithChats(
  options: WorkerRefreshFromAgentsOptions,
): Promise<void> {
  try {
    const agents = await options.fetchAgents();
    const current = options.getSnapshot();
    const fetchedChats = extractChatsFromAgents(agents);
    const nextChats = mergeFetchedChats(current.chats, fetchedChats);

    options.applyAgents(Array.isArray(agents) ? agents : []);
    options.applyChats(nextChats);
    options.rebuildWorkerRows({
      agents: Array.isArray(agents) ? agents : [],
      teams: current.teams,
      chats: nextChats,
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
