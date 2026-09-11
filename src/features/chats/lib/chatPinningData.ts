import { getChatOrder, getChats } from "@/shared/data";
import type { Chat } from "./chatState";
import type { ChatPinningSnapshot } from "./chatPinning";

export async function readChatPinningSnapshot(): Promise<ChatPinningSnapshot> {
  let response;
  try {
    response = await getChatOrder();
  } catch (error) {
    const status = Number((error as { status?: number; code?: number })?.status
      || (error as { code?: number })?.code);
    if (status === 404 || status === 501) return { order: null, chats: [] };
    throw error;
  }
  if (!Array.isArray(response.data?.pinnedOrder)) return { order: null, chats: [] };
  const result = await getChats({ pinned: true });
  const chats = (Array.isArray(result.data) ? result.data as Chat[] : [])
    .filter((chat) => Boolean(chat?.chatId) && chat.pinned === true);
  // The list is the later snapshot; its order is canonical and not capped.
  return { order: chats.map((chat) => chat.chatId), chats };
}
