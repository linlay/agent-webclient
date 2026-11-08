import { getBackendMode } from "@/shared/config/backendMode";
import { supportsPrimaryChat } from "@/features/chats/lib/primaryChatIntent";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";

/**
 * Only BOT Chats send through /api/send, where the Platform queues messages
 * for the dispatcher. Every other Agent keeps query/steer: the client starts a
 * Run when the Chat is idle and steers the Run it sees running. Gateway mode
 * has no /api/send.
 */
export function usesMailboxSend(mode: unknown): boolean {
  return getBackendMode() !== "gateway" && supportsPrimaryChat(String(mode || ""));
}

export function currentChatUsesMailboxSend(state: Parameters<typeof resolveCurrentWorkerSummary>[0]): boolean {
  const worker = resolveCurrentWorkerSummary(state);
  return worker?.type === "agent" && usesMailboxSend(worker.raw?.mode);
}
