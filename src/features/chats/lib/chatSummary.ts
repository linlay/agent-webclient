import type { Chat } from "@/features/chats/lib/chatState";
import { mergeChatReadState } from '@/features/chats/lib/chatReadState';

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
	const incomingIsOlder =
		typeof existing?.updatedAt === 'number' &&
		typeof patch.updatedAt === 'number' &&
		patch.updatedAt < existing.updatedAt;

  for (const [key, value] of Object.entries(patch)) {
    if (
		key === 'chatId' ||
		key === 'read' ||
		!hasOwn(patch, key) ||
		value === undefined ||
		(incomingIsOlder && ['updatedAt', 'lastRunId', 'lastRunContent', 'canContinue'].includes(key))
	) {
      continue;
    }
    next[key] = value;
  }

	const read = mergeChatReadState({
		existing: existing?.read,
		incoming: patch.read,
		existingLastRunId: existing?.lastRunId,
		incomingLastRunId: patch.lastRunId,
		existingUpdatedAt: existing?.updatedAt,
		incomingUpdatedAt: patch.updatedAt,
	});
	if (read) {
		next.read = read;
	}

  if (patch.lastRunId && patch.lastRunId !== existing?.lastRunId && !incomingIsOlder && patch.canContinue === undefined) {
    next.canContinue = false;
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
