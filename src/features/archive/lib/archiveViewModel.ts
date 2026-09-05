import type { Chat, WorkerConversationRow } from "@/app/state/types";
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

function toPreviewText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "content", "message", "delta", "assistantText", "initialMessage"]) {
      const nested = toPreviewText(record[key]);
      if (nested) return nested;
    }
  }
  return "";
}

export function asArchiveSummary(
  item: ArchivedSummaryResponse | ArchiveSearchResult | WorkerConversationRow | Chat,
): ArchivedSummaryResponse {
  return {
    chatId: String(item.chatId || ""),
    chatName: String(item.chatName || item.chatId || ""),
    agentKey: typeof item.agentKey === "string" ? item.agentKey : undefined,
    teamId: typeof item.teamId === "string" ? item.teamId : undefined,
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

export function extractArchivePreviewLines(
  detail: ArchiveDetailResponse | null,
): Array<{ key: string; label: string; text: string }> {
  if (!detail) return [];
  const lines: Array<{ key: string; label: string; text: string }> = [];
  for (const event of Array.isArray(detail.events) ? detail.events : []) {
    if (!event || typeof event !== "object") continue;
    const record = event as Record<string, unknown>;
    const type = String(record.type || "event");
    const text = toPreviewText(record);
    lines.push({ key: `${lines.length}-${type}`, label: type, text: text || "(no text)" });
    if (lines.length >= 40) break;
  }
  if (lines.length > 0) return lines;
  for (const run of Array.isArray(detail.runs) ? detail.runs : []) {
    if (!run || typeof run !== "object") continue;
    const record = run as Record<string, unknown>;
    const initial = toPreviewText(record.initialMessage);
    const assistant = toPreviewText(record.assistantText);
    if (initial) lines.push({ key: `${lines.length}-user`, label: "user", text: initial });
    if (assistant) lines.push({ key: `${lines.length}-assistant`, label: "assistant", text: assistant });
  }
  return lines;
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
    teamId: summary?.teamId || fallback?.teamId,
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
