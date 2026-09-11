import type { ChatsAction, ChatsState } from "./chatState";
import { applyChatPinnedOrder } from "./chatPinning";
import { mergeFetchedChats } from "./chatSummary";

export function reduceChatPinningState<S extends ChatsState>(state: S, input: { type: string }): S | null {
  const action = input as ChatsAction;
  if (action.type === "SET_CHAT_PINNING_PENDING") {
    return { ...state, chatPinningPending: action.pending };
  }
  if (action.type !== "SET_CHAT_PINNING") return null;
  const currentById = new Map(state.chats.map((chat) => [chat.chatId, chat]));
  const baseById = new Map(action.baseChats?.map((chat) => [chat.chatId, chat]));
  const deleted = new Set([...baseById.keys()].filter((id) => !currentById.has(id)));
  const order = action.order === null ? null : [...new Set(action.order)].filter((id) => !deleted.has(id));
  const incoming = (action.chats ?? []).filter((chat) => !deleted.has(chat.chatId)).map((chat) => {
    const current = currentById.get(chat.chatId);
    const base = baseById.get(chat.chatId);
    if (!current || !action.baseChats) return chat;
    // Live pushes and local actions received during this request take priority.
    const next = { ...chat };
    for (const key of new Set([...Object.keys(current), ...Object.keys(base ?? {})])) {
      if (current[key] !== base?.[key]) {
        if (key in current) next[key] = current[key];
        else delete next[key];
      }
    }
    return next;
  });
  return {
    ...state,
    chatPinnedOrder: order,
    chats: applyChatPinnedOrder(mergeFetchedChats(state.chats, incoming), order),
  };
}
