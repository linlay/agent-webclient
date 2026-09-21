import type { ChatDetailResponse } from "@/shared/data";
import type { ChatReplayProjection } from "./chatReplayProjection";
import { collectRunTerminals } from "@/features/timeline/lib/timelineDisplay";
import type { ConversationPreviewProps } from "../components/ConversationPreview";

/** Adapts live or loaded replay state at the application boundary. */
export function conversationPreviewDataFromReplay(
  chat: ChatDetailResponse,
  projection: ChatReplayProjection,
): ConversationPreviewProps["data"] {
  const state = projection.state;
  return {
    chatId: String(chat.chatId || state.chatId || ""),
    nodes: state.timelineOrder.flatMap((id) => {
      const node = state.timelineNodes.get(id);
      return node ? [node] : [];
    }),
    terminals: collectRunTerminals(state.events),
    tasks: state.taskItemsById,
    hasActiveRun: Boolean(chat.activeRun?.runId),
  };
}
