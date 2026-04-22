import type { Chat, WorkerConversationRow, WorkerRow } from '@/app/state/types';
import { normalizeChatReadState } from '@/features/chats/lib/chatReadState';
import { toText } from '@/shared/utils/eventUtils';

function normalizeUpdatedAt(updatedAt: unknown): number {
  const numeric = Number(updatedAt);
  return Number.isFinite(numeric) ? numeric : 0;
}

function compareChatFreshness(a: Chat, b: Chat): number {
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
    .map((chat) => {
      const read = normalizeChatReadState(chat?.read);
      return {
        chatId: toText(chat?.chatId),
        chatName: toText(chat?.chatName) || toText(chat?.chatId),
        updatedAt: normalizeUpdatedAt(chat?.updatedAt),
        lastRunId: toText(chat?.lastRunId),
        lastRunContent: toText(chat?.lastRunContent),
        read,
        isRead: read?.isRead ?? true,
        hasPendingAwaiting: Boolean(chat?.hasPendingAwaiting),
      };
    })
    .filter((row) => row.chatId);
}
