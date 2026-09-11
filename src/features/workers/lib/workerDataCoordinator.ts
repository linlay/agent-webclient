import type { Agent } from "@/features/agents/lib/agentState";
import type { Chat } from "@/features/chats/lib/chatState";
import type { Team, WorkerListItem } from "@/features/workers/lib/workerState";
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
