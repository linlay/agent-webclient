import type { Agent } from "@/features/agents/lib/agentState";
import type { Chat } from "@/features/chats/lib/chatState";
import type { WorkerListItem } from "@/features/workers/lib/workerState";
import { mergeFetchedChats } from '@/features/chats/lib/chatSummary';

export type WorkerDataSnapshot = {
  agents: Agent[];

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

  applyWorkerOrderKeys: (workerOrderKeys: string[]) => void;
  applyChats: (chats: Chat[]) => void;
  rebuildWorkerRows: (overrides: WorkerRefreshOverrides) => void;
  appendDebug: (line: string) => void;
}

export type WorkerListSnapshot = {
  agents: Agent[];

  chats: Chat[];
  workerOrderKeys: string[];
};

function readText(value: unknown): string {
  return String(value || '').trim();
}



function extractChatsFromWorker(
  worker: Agent,
  owner: { type: 'agent'; sourceId: string },
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
      ...(({
            agentKey:
              readText(chat.agentKey || chat.firstAgentKey) || owner.sourceId || undefined,
          })),
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

  const chats: Chat[] = [];
  const workerOrderKeys: string[] = [];

  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== 'object') continue;


    const agent = item as Agent;
    const agentKey = readText(agent.key);
    if (!agentKey) continue;
    agents.push(agent);
    workerOrderKeys.push(`agent:${agentKey}`);
    chats.push(...extractChatsFromWorker(agent, { type: 'agent', sourceId: agentKey }));
  }

  return { agents,  chats, workerOrderKeys };
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
    options.applyWorkerOrderKeys(next.workerOrderKeys);
    options.applyChats(nextChats);
    options.rebuildWorkerRows({
      agents: next.agents,

      chats: nextChats,
      workerOrderKeys: next.workerOrderKeys,
      workerSelectionKey: current.workerSelectionKey,
      workerPriorityKey: current.workerPriorityKey,
    });
  } catch (error) {
    options.appendDebug(`[loadAgents error] ${error instanceof Error ? error.message : String(error || 'unknown error')}`);
  }
}
