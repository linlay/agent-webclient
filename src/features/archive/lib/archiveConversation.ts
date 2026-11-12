import type { ConversationPreviewProps } from "@/features/conversation/components/ConversationPreview";
import { buildChatReplayProjection } from "@/features/conversation/lib/chatReplayProjection";
import {
  collectRunTerminals,
  nodesForDetailLevel,
} from "@/features/timeline/lib/timelineDisplay";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import type { ArchiveDetailResponse } from "@/shared/data";

export type ArchiveConversationData = ConversationPreviewProps["data"];

/** Archives nest the readable text of a payload under one of these keys. */
function readArchivedText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "content", "message", "delta", "assistantText", "initialMessage"]) {
      const nested = readArchivedText(record[key]);
      if (nested) return nested;
    }
  }
  return "";
}

/** Unknown timing stays 0 so the transcript shows no fabricated clock. */
function readRunTimestamp(run: Record<string, unknown>, keys: readonly string[]): number {
  for (const key of keys) {
    const timestamp = Number(run[key]);
    if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
  }
  return 0;
}

/**
 * Older archives only kept the summarized `runs` payload. Render them as the
 * same conversation rows instead of inventing a second kind of view; without
 * protocol events there is no tool, reasoning or timing detail to recover.
 */
function buildArchivedRunNodes(detail: ArchiveDetailResponse): TimelineNode[] {
  const runs = Array.isArray(detail.runs) ? detail.runs : [];
  const nodes: TimelineNode[] = [];
  for (const run of runs) {
    if (!run || typeof run !== "object") continue;
    const record = run as Record<string, unknown>;
    const runId = String(record.runId || "").trim();
    const initialMessage = readArchivedText(record.initialMessage);
    const assistantText = readArchivedText(record.assistantText);
    if (initialMessage) {
      nodes.push({
        id: `archived_run_${nodes.length}`,
        kind: "message",
        role: "user",
        text: initialMessage,
        ts: readRunTimestamp(record, ["startedAt", "createdAt", "timestamp"]),
        ...(runId ? { runId } : {}),
      });
    }
    if (assistantText) {
      nodes.push({
        id: `archived_run_${nodes.length}`,
        kind: "content",
        text: assistantText,
        status: "completed",
        ts: readRunTimestamp(record, ["finishedAt", "completedAt", "timestamp"]),
        ...(runId ? { runId } : {}),
      });
    }
  }
  return nodes;
}

/**
 * Archives persist raw protocol events, not a rendered transcript. Replaying
 * them through the canonical chat projection is what lets the detail pane hand
 * the same nodes the live conversation uses to `ConversationStage`, instead of
 * maintaining a second, event-type-shaped view of the archive.
 */
export function buildArchiveConversationData(
  detail: ArchiveDetailResponse | null,
): ArchiveConversationData | null {
  if (!detail) return null;
  const chatId = String(detail.chatId || "").trim();
  if (!chatId) return null;
  const capturedAt = Number(detail.updatedAt) || Number(detail.archivedAt) || undefined;
  const rawEvents = Array.isArray(detail.events) ? detail.events : [];

  if (rawEvents.length > 0) {
    const projection = buildChatReplayProjection(chatId, {
      events: rawEvents,
      artifact: detail.artifact,
      plan: detail.plan,
    });
    const { state } = projection;
    const nodes = nodesForDetailLevel(
      state.timelineOrder.flatMap((id) => {
        const node = state.timelineNodes.get(id);
        return node ? [node] : [];
      }),
      // An archive is a finished record: "simple" only drops the transient
      // model-retry placeholder, which must never resurface as a live state.
      "simple",
    );
    if (nodes.length > 0) {
      return {
        chatId,
        nodes,
        terminals: collectRunTerminals(state.events),
        tasks: state.taskItemsById,
        hasActiveRun: false,
        capturedAt,
      };
    }
  }

  const runNodes = buildArchivedRunNodes(detail);
  if (runNodes.length === 0) return null;
  return {
    chatId,
    nodes: runNodes,
    terminals: [],
    tasks: new Map(),
    hasActiveRun: false,
    capturedAt,
  };
}