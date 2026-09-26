import type { AppState } from "@/app/state/AppContext";

// Historical ownership wins over the selected worker and the URL. This is a
// client execution gate only; it must never participate in history loading.
export function isAgentExecutionBlocked(state: Partial<Pick<AppState,
  "agentAvailability" | "chatId" | "chats" | "chatAgentById" | "workerSelectionKey"
>>, explicitAgentKey?: string): boolean {
  const chat = state.chats?.find(item => item.chatId === state.chatId);
  if (!explicitAgentKey && chat?.teamId) return false;
  const selected = state.workerSelectionKey?.startsWith("agent:")
    ? state.workerSelectionKey.slice(6) : "";
  const key = explicitAgentKey || state.chatAgentById?.get(state.chatId || "") ||
    chat?.agentKey || chat?.firstAgentKey || selected;
  const status = key ? state.agentAvailability?.[key] : undefined;
  return Boolean(status && status !== "available");
}
