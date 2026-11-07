import type { ChatDetailResponse } from "@/shared/data/api/dto/chats";

// Only the authoritative Chat snapshot describes current waiting; historical
// awaiting.ask events and mail suspension metadata may already be resolved.
export function mailChatStatus(chat: ChatDetailResponse | null | undefined): string {
  if (!chat) return "unknown";
  if (chat.awaiting?.status === "awaiting") {
    const mode = chat.awaiting.mode;
    return ["approval", "question", "form", "plan"].includes(String(mode)) ? String(mode) : "waiting";
  }
  if (chat.hasPendingAwaiting === true) return "waiting";
  if (chat.activeRun?.runId || chat.hasActiveRun === true) return "running";
  if (chat.hasActiveRun === false || chat.activeRun === null) return "idle";
  return "unknown";
}
