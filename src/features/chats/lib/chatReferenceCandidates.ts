import type { Chat } from "./chatState";

export const CHAT_REFERENCE_LIMIT = 24;
// Search returns individual hits; keep the request bounded before grouping chats.
export const CHAT_REFERENCE_SEARCH_LIMIT = 75;

export type ChatReferenceCandidate = Pick<Chat, "chatId" | "chatName">;

export function normalizeChatReferenceCandidates(
  data: unknown,
  currentChatId: string,
): ChatReferenceCandidate[] {
  if (!Array.isArray(data)) return [];
  const candidates: ChatReferenceCandidate[] = [];
  const seen = new Set<string>();
  for (const value of data) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const chatId = typeof row.chatId === "string" ? row.chatId.trim() : "";
    if (!chatId || chatId === currentChatId || seen.has(chatId)) continue;
    seen.add(chatId);
    candidates.push({
      chatId,
      chatName: typeof row.chatName === "string" ? row.chatName.trim() : "",
    });
    if (candidates.length === CHAT_REFERENCE_LIMIT) break;
  }
  return candidates;
}
