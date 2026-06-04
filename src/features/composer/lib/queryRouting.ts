import type { AppState, Chat, WorkerRow } from "@/app/state/types";

type RoutingState = Pick<
  AppState,
  | "chatId"
  | "chatAgentById"
  | "workerIndexByKey"
  | "pendingNewChatAgentKey"
  | "workerSelectionKey"
> & {
  chats?: Array<Pick<Chat, "agentKey" | "chatId" | "firstAgentKey">>;
};

interface RoutingOptions {
  chatId?: string;
  explicitAgentKey?: string;
  explicitTeamId?: string;
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function resolveSelectedWorker(state: RoutingState): WorkerRow | null {
  const workerKey = normalizeText(state.workerSelectionKey);
  if (!workerKey) {
    return null;
  }
  return state.workerIndexByKey.get(workerKey) || null;
}

function resolveChatSummaryAgentKey(
  state: RoutingState,
  chatId: string,
): string {
  const chat = state.chats?.find(
    (item) => normalizeText(item?.chatId) === chatId,
  );
  return normalizeText(chat?.agentKey || chat?.firstAgentKey);
}

export function resolvePreferredAgentKey(
  state: RoutingState,
  options: RoutingOptions = {},
): string {
  const explicitAgentKey = normalizeText(options.explicitAgentKey);
  if (explicitAgentKey) {
    return explicitAgentKey;
  }

  const chatId = normalizeText(options.chatId) || normalizeText(state.chatId);
  if (chatId) {
    const chatAgentKey = resolveChatSummaryAgentKey(state, chatId);
    if (chatAgentKey) {
      return chatAgentKey;
    }

    const remembered = normalizeText(state.chatAgentById.get(chatId));
    if (remembered) {
      return remembered;
    }
  }

  const pendingAgentKey = normalizeText(state.pendingNewChatAgentKey);
  if (pendingAgentKey) {
    return pendingAgentKey;
  }

  const selectedWorker = resolveSelectedWorker(state);
  if (selectedWorker?.type === "agent") {
    return normalizeText(selectedWorker.sourceId);
  }

  return "";
}

export function resolvePreferredTeamId(
  state: RoutingState,
  options: RoutingOptions = {},
): string {
  const explicitTeamId = normalizeText(options.explicitTeamId);
  if (explicitTeamId) {
    return explicitTeamId;
  }

  const chatId = normalizeText(options.chatId) || normalizeText(state.chatId);
  if (chatId) {
    return "";
  }

  const selectedWorker = resolveSelectedWorker(state);
  if (selectedWorker?.type === "team") {
    return normalizeText(selectedWorker.sourceId);
  }

  return "";
}
