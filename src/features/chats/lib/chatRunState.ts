import type { AgentEvent, Chat, WorkerConversationRow } from "@/app/state/types";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
import { toText } from "@/shared/utils/eventUtils";

type ChatRunStateCarrier = {
  activeRun?: unknown;
  hasActiveRun?: boolean;
} | null | undefined;

type WorkerAttentionChatCarrier = (
  | Pick<Chat, "activeRun" | "hasActiveRun" | "hasPendingAwaiting" | "read">
  | (
    Pick<
      WorkerConversationRow,
      "hasActiveRun" | "hasPendingAwaiting" | "isRead" | "read"
    > & { activeRun?: unknown }
  )
) | null | undefined;

function readActiveRunId(activeRun: unknown): string {
  if (!activeRun || typeof activeRun !== "object" || Array.isArray(activeRun)) {
    return "";
  }
  return toText((activeRun as { runId?: unknown }).runId);
}

export function isChatActiveRun(chat: ChatRunStateCarrier): boolean {
  if (!chat) return false;
  if (chat.hasActiveRun === true) return true;
  if (chat.hasActiveRun === false) return false;
  return Boolean(readActiveRunId(chat.activeRun));
}

export function isWorkerAttentionChat(
  chat: WorkerAttentionChatCarrier,
): boolean {
  return Boolean(
    chat &&
      (chat.hasPendingAwaiting === true ||
        isChatUnread(chat) ||
        isChatActiveRun(chat)),
  );
}

export function resolveChatSummaryActiveRun(
  event: AgentEvent,
): boolean | undefined {
  const type = toText(event.type);
  if (type === "run.start") {
    return true;
  }
  if (type === "run.complete" || type === "run.error" || type === "run.cancel") {
    return false;
  }
  return undefined;
}
