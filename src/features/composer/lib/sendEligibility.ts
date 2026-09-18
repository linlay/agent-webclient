import { readSelectedText } from "@/shared/contracts/selectedTextReference";
// Upload status is checked by the composer. Only first queries require typed text.
export function hasSendableContent(message: unknown, references: unknown, allowReferenceOnly = false): boolean {
  if (String(message ?? "").trim()) return true;
  return allowReferenceOnly && Array.isArray(references) && references.some(reference => {
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) return false;
    if (reference.type === "selection") {
      return Boolean(readSelectedText(reference).trim());
    }
    return (!reference.type || reference.type === "file") &&
      typeof reference.url === "string" && Boolean(reference.url.trim());
  });
}

/** Only server-confirmed history counts; a preallocated chat ID or optimistic node does not. */
export function hasQueryHistory(
  state: {
    chatId: string;
    chats: { chatId: string; lastRunId?: string }[];
    events: { type: string; chatId?: string; lane?: unknown; hidden?: unknown }[];
  },
  chatId = state.chatId,
): boolean {
  if (!chatId) return false;
  if (state.chats.some(chat => chat.chatId === chatId && Boolean(chat.lastRunId?.trim()))) return true;
  return state.chatId === chatId && state.events.some(event =>
    event.type === "request.query" && (!event.chatId || event.chatId === chatId) &&
    (!event.lane || event.lane === "main") && event.hidden !== true,
  );
}
