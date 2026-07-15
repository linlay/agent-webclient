import { useMemo } from "react";
import type { AppState } from "@/app/state/types";
import { resolveRunAgentKey } from "@/features/runs/lib/runAgentIdentity";
import { resolvePreferredAgentKey } from "@/features/composer/lib/queryRouting";
import { resolveRunOwner } from "@/features/runs/lib/runOwner";
import { toRunOwner, type RunOwner } from "@/shared/data/runOwner";
import { resolveActiveRunId } from "@/features/composer/lib/steerSubmission";

type ActiveRunIdentityState = Pick<
  AppState,
  | "activeAwaiting"
  | "chatAgentById"
  | "chatId"
  | "chats"
  | "currentChatActiveRun"
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
  activeRunOwner: RunOwner | null;
} {
  const activeRunId = useMemo(() => {
    if (
      state.currentChatActiveRun?.runId &&
      state.currentChatActiveRun.chatId === state.chatId
    ) {
      return String(state.currentChatActiveRun.runId || "").trim();
    }
    const resolvedRunId = resolveActiveRunId({
      stateRunId: state.runId,
      events: state.events,
    });
    if (resolvedRunId) {
      return resolvedRunId;
    }
    return String(state.activeAwaiting?.runId || "").trim();
  }, [
    state.activeAwaiting?.runId,
    state.chatId,
    state.currentChatActiveRun,
    state.events,
    state.runId,
  ]);

  const activeRunAgentKey = useMemo(() => {
    if (!activeRunId) {
      return "";
    }
    return resolveRunAgentKey({
      runId: activeRunId,
      currentRunAgentKey: state.currentRunAgentKey,
      runAgentById: state.runAgentById,
      routingAgentKey:
        state.currentChatActiveRun?.agentKey || state.activeAwaiting?.agentKey,
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
    state.currentChatActiveRun?.agentKey,
    state.currentRunAgentKey,
    state.pendingNewChatAgentKey,
    state.runAgentById,
    state.workerIndexByKey,
    state.workerSelectionKey,
  ]);

  const activeRunOwner = useMemo(() => {
    if (!activeRunId) return null;
    return resolveRunOwner({
      chatId: state.chatId,
      chats: state.chats,
      currentRunOwner: state.currentChatActiveRun?.owner,
      fallbackOwner: toRunOwner({ agentKey: activeRunAgentKey }),
    });
  }, [activeRunAgentKey, activeRunId, state.chatId, state.chats, state.currentChatActiveRun?.owner]);

  return {
    activeRunId,
    activeRunAgentKey,
    activeRunOwner,
  };
}
