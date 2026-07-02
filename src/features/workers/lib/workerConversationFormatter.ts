import type { Chat, WorkerConversationRow, WorkerRow } from '@/app/state/types';
import { isChatActiveRun } from '@/features/chats/lib/chatRunState';
import { normalizeChatReadState } from '@/features/chats/lib/chatReadState';
import { toText } from '@/shared/utils/eventUtils';
import { readEpochMillis } from '@/shared/utils/platformTime';

function normalizeUpdatedAt(updatedAt: unknown): number {
  return readEpochMillis(updatedAt);
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
        chatName: toText(chat?.chatName),
        agentKey: toText(chat?.agentKey || chat?.firstAgentKey) || undefined,
        teamId: toText(chat?.teamId) || undefined,
        updatedAt: normalizeUpdatedAt(chat?.updatedAt),
        lastRunId: toText(chat?.lastRunId),
        lastRunContent: toText(chat?.lastRunContent),
        read,
        isRead: read?.isRead ?? true,
        hasPendingAwaiting: Boolean(chat?.hasPendingAwaiting),
        awaitingMode: (chat as any)?.awaiting?.mode || undefined,
        hasActiveRun: isChatActiveRun(chat),
      };
    })
    .filter((row) => row.chatId);
}
