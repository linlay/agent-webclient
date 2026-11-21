import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { setRunActivityTimeline } from "@/features/timeline/lib/timelineState";
import { RUN_ACTIVITY_NODE_ID } from "@/shared/ui/modelRetry";
import {
  createReplayState,
  reconcileReplayAwaiting,
  replayEvent,
  setReplayArtifacts,
  setReplayPlan,
  type AwaitingReplayReconciliation,
  type ReplayState,
} from "@/features/conversation/lib/conversationReplay";
import {
  normalizeChatArtifactItems,
  normalizeChatRunAnnouncement,
  normalizeChatPlan,
  normalizeLoadedChatEvents,
} from "@/features/conversation/lib/conversationPayload";

export interface ChatReplayProjection {
  state: ReplayState;
  events: AgentEvent[];
  rawEventCount: number;
  awaitingReconciliation: AwaitingReplayReconciliation;
}

export function buildChatReplayProjection(
  chatId: string,
  chatData: Record<string, unknown>,
): ChatReplayProjection {
  const normalizedChatId = String(chatId || "").trim();
  const rawEvents = Array.isArray(chatData.events) ? chatData.events : [];
  const events = normalizeLoadedChatEvents(rawEvents);
  const state = createReplayState();
  state.chatId = normalizedChatId;

  for (const event of events) {
    if (event.chatId && String(event.chatId) !== normalizedChatId) continue;
    replayEvent(state, event);
  }

  const artifacts = normalizeChatArtifactItems(chatData.artifact);
  if (artifacts !== undefined) {
    setReplayArtifacts(state, artifacts);
  }

  if (Object.prototype.hasOwnProperty.call(chatData, "plan")) {
    const plan = normalizeChatPlan(chatData.plan);
    if (plan !== undefined) {
      setReplayPlan(state, plan, {
        resetRuntime:
          !plan ||
          Boolean(
            state.plan?.planId &&
              plan.planId &&
              state.plan.planId !== plan.planId,
          ),
      });
    }
  }

  const announcement = normalizeChatRunAnnouncement(chatData.activeRun);
  if (announcement) {
    Object.assign(state, setRunActivityTimeline(state, {
      id: RUN_ACTIVITY_NODE_ID,
      kind: "message",
      role: "system",
      systemMessageLevel: "activity",
      runId: announcement.runId,
      ts: announcement.timestamp,
      text: announcement.message,
    }));
  }

  return {
    state,
    events,
    rawEventCount: rawEvents.length,
    awaitingReconciliation: reconcileReplayAwaiting(state, chatData.awaiting),
  };
}
