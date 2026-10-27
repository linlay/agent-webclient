import type { Agent } from "@/features/agents/lib/agentState";
import type { Chat } from "@/features/chats/lib/chatState";
import { mergeChatSummary } from "@/features/chats/lib/chatSummary";

/** Only the Platform pointer chooses the primary; latest/pinned chats are unrelated. */
export function selectPrimaryNavigation(agents: Agent[], chats: Chat[]) {
  const byId = new Map(chats.map(chat => [chat.chatId, chat]));
  return agents.map(agent => {
    const snapshot = agent.primaryChat;
    const live = snapshot?.chatId ? byId.get(snapshot.chatId) : undefined;
    const chat = snapshot?.chatId
      ? live ? mergeChatSummary(snapshot, live) : snapshot
      : undefined;
    return { agent, chat };
  });
}
