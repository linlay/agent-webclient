import type { Chat, WorkerConversationRow, WorkerRow } from '../context/types';
import { toText } from './eventUtils';

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

function compareChatFreshness(a: Chat, b: Chat): number {
  const runA = toRunSortValue(a?.lastRunId);
  const runB = toRunSortValue(b?.lastRunId);
  if (runA !== runB) return runB - runA;

  const updatedA = normalizeUpdatedAt(a?.updatedAt);
  const updatedB = normalizeUpdatedAt(b?.updatedAt);
  if (updatedA !== updatedB) return updatedB - updatedA;

  const chatA = toText(a?.chatId);
  const chatB = toText(b?.chatId);
  return chatA.localeCompare(chatB);
}

function matchChatByWorker(chat: Chat, worker: WorkerRow | null): boolean {
  if (!worker) return false;

  if (worker.type === 'team') {
    return toText(chat?.teamId) === toText(worker.sourceId);
  }

  if (worker.type === 'agent') {
    return toText(chat?.agentKey || chat?.firstAgentKey) === toText(worker.sourceId);
  }

  return false;
}

export function buildWorkerConversationRows(input: { chats: Chat[]; worker: WorkerRow | null }): WorkerConversationRow[] {
  const matchedChats = Array.isArray(input.chats)
    ? input.chats.filter((chat) => matchChatByWorker(chat, input.worker))
    : [];

  return matchedChats
    .slice()
    .sort(compareChatFreshness)
    .map((chat) => ({
      chatId: toText(chat?.chatId),
      chatName: toText(chat?.chatName) || toText(chat?.chatId),
      updatedAt: normalizeUpdatedAt(chat?.updatedAt),
      lastRunId: toText(chat?.lastRunId),
      lastRunContent: toText(chat?.lastRunContent),
    }))
    .filter((row) => row.chatId);
}
