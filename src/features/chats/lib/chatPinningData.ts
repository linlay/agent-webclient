import { getChatOrder } from "@/shared/data";
import type { Chat } from "./chatState";
import type { ChatPinningSnapshot } from "./chatPinning";

export async function readChatPinningSnapshot(): Promise<ChatPinningSnapshot> {
  const response = await getChatOrder();
  if (!Array.isArray(response.data?.pinnedChats)) {
    throw new Error("Invalid chat order snapshot: pinnedChats must be an array");
  }
  const chats = (response.data.pinnedChats as Chat[])
    .filter((chat) => Boolean(chat?.chatId) && chat.pinned === true);
  // The server returns the full ordered snapshot; no second list request is needed.
  return { order: chats.map((chat) => chat.chatId), chats };
}
