import type { Chat, WorkerConversationRow, WorkerRow } from '../context/types';
import { buildWorkerConversationRows } from './workerConversationFormatter';

export type ChatSummaryPatch = Partial<Chat> & Pick<Chat, 'chatId'>;

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

export function mergeChatSummary(
  existing: Chat | undefined,
  patch: ChatSummaryPatch,
): Chat {
  const next: Chat = {
    ...(existing || {}),
    chatId: patch.chatId,
  };

  for (const [key, value] of Object.entries(patch)) {
    if (key === 'chatId' || !hasOwn(patch, key) || value === undefined) {
      continue;
    }
    next[key] = value;
  }

  return next;
}

export function upsertChatSummary(
  chats: Chat[],
  patch: ChatSummaryPatch,
): Chat[] {
  const currentChats = Array.isArray(chats) ? chats : [];
  const existingIndex = currentChats.findIndex(
    (chat) => String(chat?.chatId || '') === String(patch.chatId || ''),
  );
  const existing = existingIndex >= 0 ? currentChats[existingIndex] : undefined;
  const merged = mergeChatSummary(existing, patch);
  const remaining =
    existingIndex >= 0
      ? [
          ...currentChats.slice(0, existingIndex),
          ...currentChats.slice(existingIndex + 1),
        ]
      : currentChats.slice();
  return [merged, ...remaining];
}

export function mergeFetchedChats(
  currentChats: Chat[],
  fetchedChats: Chat[],
): Chat[] {
  const incoming = Array.isArray(fetchedChats) ? fetchedChats : [];
  let merged = Array.isArray(currentChats) ? currentChats.slice() : [];

  for (let index = incoming.length - 1; index >= 0; index -= 1) {
    const chat = incoming[index];
    const chatId = String(chat?.chatId || '').trim();
    if (!chatId) continue;
    merged = upsertChatSummary(merged, chat as ChatSummaryPatch);
  }

  return merged;
}

export function buildSelectedWorkerConversationRows(input: {
  chats: Chat[];
  workerSelectionKey: string;
  workerIndexByKey: Map<string, WorkerRow>;
}): WorkerConversationRow[] {
  const selectedWorker =
    input.workerIndexByKey.get(String(input.workerSelectionKey || '').trim()) ||
    null;
  return buildWorkerConversationRows({
    chats: input.chats,
    worker: selectedWorker,
  });
}
