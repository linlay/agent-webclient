import type { AppState } from "@/app/state/AppContext";
import type { Chat } from "@/features/chats/lib/chatState";
import {
  toRunOwner,
  type RunOwner,
  type RunOwnerIdentity,
} from "@/shared/data/runOwner";

function text(value: unknown): string {
  return String(value || "").trim();
}



export function readChatRunOwner(chat: Partial<Chat> | null | undefined): RunOwner | null {
  return toRunOwner({

    agentKey: chat?.agentKey || chat?.firstAgentKey,
  });
}

export function findChatRunOwner(chats: Array<Partial<Chat>>, chatId?: unknown): RunOwner | null {
  const normalizedChatId = text(chatId);
  if (!normalizedChatId) return null;
  return readChatRunOwner(chats.find((chat) => text(chat?.chatId) === normalizedChatId));
}

export function resolveRunOwner(input: {
  chatId?: unknown;
  chats?: Array<Partial<Chat>>;
  currentRunOwner?: RunOwner | null;
  sessionOwner?: RunOwner | null;
  eventIdentity?: RunOwnerIdentity | null;
  fallbackOwner?: RunOwner | null;
}): RunOwner | null {
  return (
    findChatRunOwner(input.chats || [], input.chatId)
    || input.currentRunOwner
    || input.sessionOwner
    || toRunOwner(input.eventIdentity)
    || input.fallbackOwner
    || null
  );
}

export type OwnerRoutingState = Pick<
  AppState,
  | "chatId"
  | "chatAgentById"
  | "workerIndexByKey"
  | "pendingNewChatAgentKey"
  | "workerSelectionKey"
> & {
  chats?: Array<Pick<Chat, "agentKey" | "chatId" | "firstAgentKey">>;
};

export function resolvePreferredRunOwner(
  state: OwnerRoutingState,
  options: { chatId?: string; explicitAgentKey?: string } = {},
): RunOwner | null {
  const chatId = text(options.chatId) || text(state.chatId);
  const savedOwner = findChatRunOwner(state.chats || [], chatId);
  if (savedOwner) return savedOwner;

  const explicitAgentKey = text(options.explicitAgentKey);
  if (explicitAgentKey) return { kind: "agent", agentKey: explicitAgentKey };

  const pendingAgentKey = text(state.pendingNewChatAgentKey);
  if (pendingAgentKey) return { kind: "agent", agentKey: pendingAgentKey };

  const workerKey = text(state.workerSelectionKey);
  const worker = workerKey ? state.workerIndexByKey.get(workerKey) : null;

  if (worker?.type === "agent") {
    return { kind: "agent", agentKey: text(worker.sourceId) };
  }

  const rememberedAgentKey = chatId ? text(state.chatAgentById.get(chatId)) : "";
  return rememberedAgentKey ? { kind: "agent", agentKey: rememberedAgentKey } : null;
}
