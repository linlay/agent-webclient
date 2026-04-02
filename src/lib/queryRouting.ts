import type { AppState, WorkerRow } from "../context/types";

type RoutingState = Pick<
  AppState,
  | "chatId"
  | "chatAgentById"
  | "pendingNewChatAgentKey"
  | "workerSelectionKey"
  | "workerIndexByKey"
>;

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
