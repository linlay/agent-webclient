import type { ChatsState } from "./chatState";
import type { AgentsState } from "@/features/agents/lib/agentState";
import type { ConversationState } from "@/features/conversation/lib/conversationState";
import type { WorkersState } from "@/features/workers/lib/workerState";
import { normalizeEventDetailLevel, type EventDetailLevel } from "@/shared/data/eventDetailLevel";

type DetailState = Pick<ChatsState, "chats"> & Pick<AgentsState, "agents"> &
  Pick<ConversationState, "chatId" | "chatAgentById"> &
  Pick<WorkersState, "pendingNewChatAgentKey" | "workerSelectionKey" | "workerIndexByKey">;

/** Loaded Chat metadata avoids waiting for Agent hydration. New Chat uses
 * the selected Agent's resolved configuration, with no client mode defaults. */
export function chatDetailLevel(state: DetailState): EventDetailLevel {
  const chat = state.chatId ? state.chats.find(item => item.chatId === state.chatId) : undefined;
  if (chat?.display) return normalizeEventDetailLevel(chat.display.effectiveDetail);
  const worker = state.workerIndexByKey.get(state.workerSelectionKey);
  const agentKey = chat?.agentKey || chat?.firstAgentKey ||
    (state.chatId ? state.chatAgentById.get(state.chatId) : "") ||
    state.pendingNewChatAgentKey || (worker?.type === "agent" ? worker.sourceId : "");
  const agent = state.agents.find(item => item.key === agentKey);
  const config = agent?.interactionConfig as { defaultDetail?: unknown } | undefined;
  return normalizeEventDetailLevel(config?.defaultDetail);
}
