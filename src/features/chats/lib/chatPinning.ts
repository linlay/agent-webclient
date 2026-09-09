import type { Chat } from "./chatState";

export interface ChatPinningSnapshot {
  order: string[] | null;
  chats: Chat[];
}

export function applyChatPinnedOrder(chats: Chat[], order: string[] | null | undefined): Chat[] {
  const ids = new Set(order ?? []);
  return chats.map((chat) => {
    const pinned = ids.has(chat.chatId);
    return Boolean(chat.pinned) === pinned ? chat : { ...chat, pinned };
  });
}

export function selectPinnedChats(chats: Chat[], order: string[] | null | undefined): Chat[] {
  const byId = new Map(chats.map((chat) => [chat.chatId, chat]));
  return (order ?? []).flatMap((id) => {
    const chat = byId.get(id);
    return chat ? [chat] : [];
  });
}


/** Move within the pinned group without changing the normal chat sort mode. */
export function buildPinnedChatMove(order: string[], chatId: string, targetId: string): import("@/shared/data/api/dto/chats").UpdateChatOrderRequest | null {
  const from = order.indexOf(chatId);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return null;
  return from < to
    ? { operation: "move", chatId, afterChatId: targetId }
    : { operation: "move", chatId, beforeChatId: targetId };
}
