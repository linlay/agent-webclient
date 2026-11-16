import type { Chat } from "@/features/chats/lib/chatState";
import type { WorkerConversationRow } from "@/features/workers/lib/workerState";
import type {
  ArchiveDetailResponse,
  ArchiveSearchResult,
  ArchivedSummaryResponse,
  ChatSummaryResponse,
} from "@/shared/data";

export function toArchiveTimestamp(value: unknown): number {
  const timestamp = typeof value === "number" ? value : Number(value);
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : 0;
}

export function archiveLastRunAt(item: unknown): number {
  if (!item || typeof item !== "object") return 0;
  const record = item as Partial<ArchivedSummaryResponse>;
  return toArchiveTimestamp(record.lastRunAt) || toArchiveTimestamp(record.updatedAt);
}

/**
 * Full local timestamp for list rows, e.g. `2026-09-10 16:05`. Archive rows
 * keep the clock time visible instead of collapsing older entries to a date.
 */
export function formatArchiveTimestamp(value: unknown): string {
  const timestamp = toArchiveTimestamp(value);
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function asArchiveSummary(
  item: ArchivedSummaryResponse | ArchiveSearchResult | WorkerConversationRow | Chat,
): ArchivedSummaryResponse {
  return {
    chatId: String(item.chatId || ""),
    chatName: String(item.chatName || item.chatId || ""),
    agentKey: typeof item.agentKey === "string" ? item.agentKey : undefined,

    createdAt: toArchiveTimestamp((item as Partial<ArchivedSummaryResponse>).createdAt),
    updatedAt: toArchiveTimestamp((item as Partial<ArchivedSummaryResponse>).updatedAt),
    lastRunAt: archiveLastRunAt(item),
    archivedAt: toArchiveTimestamp((item as Partial<ArchivedSummaryResponse>).archivedAt),
    lastRunId: String(item.lastRunId || ""),
    lastRunContent: String(item.lastRunContent || ""),
    hasAttachments: Boolean((item as Partial<ArchivedSummaryResponse>).hasAttachments),
  };
}

export function buildArchiveBulkCandidates(input: {
  chats: Chat[];
  workerRelatedChats: WorkerConversationRow[];
  workerSelectionKey: string;
  days: number;
  nowMs?: number;
}): ArchivedSummaryResponse[] {
  const days = Math.max(1, Math.floor(Number(input.days) || 0));
  const cutoff = (input.nowMs ?? Date.now()) - days * 24 * 60 * 60 * 1000;
  const rows = input.workerSelectionKey ? input.workerRelatedChats : input.chats;
  return rows.map(asArchiveSummary).filter((item) => {
    if (!item.chatId) return false;
    const lastRunAt = toArchiveTimestamp(item.lastRunAt);
    return Boolean(lastRunAt && lastRunAt < cutoff);
  });
}

export function normalizeRestoredChat(
  summary: ChatSummaryResponse | undefined,
  fallback: ArchivedSummaryResponse | undefined,
): Partial<Chat> & Pick<Chat, "chatId"> {
  return {
    ...(fallback || {}),
    ...(summary || {}),
    chatId: String(summary?.chatId || fallback?.chatId || ""),
    chatName: String(summary?.chatName || fallback?.chatName || fallback?.chatId || ""),
    agentKey: summary?.agentKey || fallback?.agentKey,

    updatedAt: toArchiveTimestamp(summary?.updatedAt ?? fallback?.lastRunAt ?? fallback?.updatedAt),
    createdAt: toArchiveTimestamp(summary?.createdAt ?? fallback?.createdAt),
    lastRunId: String(summary?.lastRunId || fallback?.lastRunId || ""),
    lastRunContent: String(summary?.lastRunContent || fallback?.lastRunContent || ""),
  } as Partial<Chat> & Pick<Chat, "chatId">;
}

export function formatArchiveUsageSummary(item: ArchivedSummaryResponse | undefined): string {
  const usage = item?.usage;
  if (!usage) return "";
  const parts: string[] = [];
  const totalTokens = Number(usage.totalTokens || 0);
  const calls = Number(usage.llmChatCompletionCount || 0);
  const toolCalls = Number(usage.toolCallCount || 0);
  if (totalTokens > 0) parts.push(`${totalTokens} tokens`);
  if (calls > 0) parts.push(`${calls} LLM`);
  if (toolCalls > 0) parts.push(`${toolCalls} tools`);
  const cost = usage.estimatedCost?.total;
  if (typeof cost === "number" && cost > 0) {
    parts.push(`${usage.estimatedCost?.currency || ""}${cost.toFixed(4)}`.trim());
  }
  return parts.join(" · ");
}

export type ArchiveDateRange = [number | null, number | null] | null;

export interface ArchiveFilterRanges {
  archivedRange: ArchiveDateRange;
  createdRange: ArchiveDateRange;
  lastRunRange: ArchiveDateRange;
}

function isWithinArchiveRange(value: number, range: ArchiveDateRange): boolean {
  if (!range) return true;
  const [start, end] = range;
  if (start != null && value < start) return false;
  if (end != null && value > end) return false;
  return true;
}

export function filterArchives(
  items: ArchivedSummaryResponse[],
  ranges: ArchiveFilterRanges,
): ArchivedSummaryResponse[] {
  return items.filter((item) => {
    if (!isWithinArchiveRange(toArchiveTimestamp(item.archivedAt), ranges.archivedRange)) return false;
    if (!isWithinArchiveRange(toArchiveTimestamp(item.createdAt), ranges.createdRange)) return false;
    if (!isWithinArchiveRange(archiveLastRunAt(item), ranges.lastRunRange)) return false;
    return true;
  });
}

/** Normalized grouping key; an empty key is the "no agent" group. */
export function archiveAgentKeyOf(
  item: Pick<ArchivedSummaryResponse, "agentKey"> | undefined,
): string {
  return String(item?.agentKey || "").trim();
}

export interface ArchiveAgentGroup {
  key: string;
  items: ArchivedSummaryResponse[];
  count: number;
}

/**
 * Groups archived chat summaries by owning agent. Items keep the incoming
 * order inside each group; groups themselves are ordered by size so the
 * busiest agents stay on top, with the unassigned group last.
 */
export function groupArchivesByAgent(
  items: ArchivedSummaryResponse[],
): ArchiveAgentGroup[] {
  const buckets = new Map<string, ArchivedSummaryResponse[]>();
  for (const item of items) {
    const key = archiveAgentKeyOf(item);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  return [...buckets.entries()]
    .map(([key, groupItems]) => ({
      key,
      items: groupItems,
      count: groupItems.length,
    }))
    .sort((left, right) => {
      if (!left.key !== !right.key) return left.key ? -1 : 1;
      if (right.count !== left.count) return right.count - left.count;
      return left.key.localeCompare(right.key);
    });
}
