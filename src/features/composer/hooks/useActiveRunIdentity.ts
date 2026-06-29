import { useMemo } from "react";
import type { AppState } from "@/app/state/types";
import { resolveRunAgentKey } from "@/features/chats/lib/runAgentIdentity";
import { resolvePreferredAgentKey } from "@/features/composer/lib/queryRouting";
import { resolveActiveRunId } from "@/features/composer/lib/steerSubmission";

type ActiveRunIdentityState = Pick<
  AppState,
  | "activeAwaiting"
  | "chatAgentById"
  | "chatId"
  | "chats"
  | "currentRunAgentKey"
  | "events"
  | "pendingNewChatAgentKey"
  | "runAgentById"
  | "runId"
  | "workerIndexByKey"
  | "workerSelectionKey"
>;

export function useActiveRunIdentity(state: ActiveRunIdentityState): {
  activeRunId: string;
  activeRunAgentKey: string;
} {
  const activeRunId = useMemo(() => {
    const resolvedRunId = resolveActiveRunId({
      stateRunId: state.runId,
      events: state.events,
    });
    if (resolvedRunId) {
      return resolvedRunId;
    }
    return String(state.activeAwaiting?.runId || "").trim();
  }, [state.activeAwaiting?.runId, state.events, state.runId]);

  const activeRunAgentKey = useMemo(() => {
    if (!activeRunId) {
      return "";
    }
    return resolveRunAgentKey({
      runId: activeRunId,
      currentRunAgentKey: state.currentRunAgentKey,
      runAgentById: state.runAgentById,
      routingAgentKey: state.activeAwaiting?.agentKey,
      chatId: state.chatId,
      chatAgentById: state.chatAgentById,
      chats: state.chats,
      fallbackAgentKey: resolvePreferredAgentKey({
        chatId: state.chatId,
        chatAgentById: state.chatAgentById,
        chats: state.chats,
        pendingNewChatAgentKey: state.pendingNewChatAgentKey,
        workerSelectionKey: state.workerSelectionKey,
        workerIndexByKey: state.workerIndexByKey,
      }),
    });
  }, [
    activeRunId,
    state.activeAwaiting?.agentKey,
    state.chatAgentById,
    state.chatId,
    state.chats,
    state.currentRunAgentKey,
    state.pendingNewChatAgentKey,
    state.runAgentById,
    state.workerIndexByKey,
    state.workerSelectionKey,
  ]);

  return {
    activeRunId,
    activeRunAgentKey,
  };
}
