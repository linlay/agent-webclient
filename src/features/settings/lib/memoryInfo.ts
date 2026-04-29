import type { Agent, AppState, Chat } from "@/app/state/types";
import type {
  MemoryPreferenceScopeType,
  MemoryScopeDraftRecord,
  MemoryScopeRecord,
  MemoryScopeRecordInput,
  MemoryScopeSummary,
} from "@/shared/api/memoryTypes";
import { toText } from "@/shared/utils/eventUtils";

export interface MemoryAgentContext {
  agentKey: string;
  label: string;
  source: "worker" | "chat" | "none";
}

function findChatById(chats: Chat[], chatId: string): Chat | null {
  const normalized = toText(chatId);
  return chats.find((chat) => toText(chat?.chatId) === normalized) || null;
}

function findAgentByKey(agents: Agent[], agentKey: string): Agent | null {
  const normalized = toText(agentKey);
  return agents.find((agent) => toText(agent?.key) === normalized) || null;
}

export function resolveMemoryAgentContext(
  state: Pick<
    AppState,
    | "agents"
    | "teams"
    | "chats"
    | "chatId"
    | "chatAgentById"
    | "workerSelectionKey"
    | "workerIndexByKey"
    | "workerRows"
    | "workerRelatedChats"
  >,
): MemoryAgentContext {
  const selectedWorkerKey = toText(state.workerSelectionKey);
  if (selectedWorkerKey.startsWith("agent:")) {
    const selectedWorker =
      state.workerIndexByKey.get(selectedWorkerKey) ||
      state.workerRows.find((row) => toText(row.key) === selectedWorkerKey) ||
      null;
    const selectedAgentKey =
      toText(selectedWorker?.sourceId) || selectedWorkerKey.slice("agent:".length);
    const selectedAgent = findAgentByKey(state.agents, selectedAgentKey);
    return {
      agentKey: selectedAgentKey,
      label:
        toText(selectedWorker?.displayName) ||
        toText(selectedAgent?.name) ||
        selectedAgentKey,
      source: "worker",
    };
  }

  const chatId = toText(state.chatId);
  if (chatId) {
    const chat = findChatById(state.chats, chatId);
    const agentKey = toText(
      chat?.agentKey || chat?.firstAgentKey || state.chatAgentById.get(chatId),
    );
    if (agentKey) {
      const agent = findAgentByKey(state.agents, agentKey);
      return {
        agentKey,
        label: toText(agent?.name) || agentKey,
        source: "chat",
      };
    }
  }

  return {
    agentKey: "",
    label: "",
    source: "none",
  };
}

export function formatMemoryTimestamp(value?: number | null): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "--";
  }
  return new Date(numeric).toLocaleString();
}

export function formatMemoryJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

export function normalizeMemoryTagList(tags?: string[]): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((item) => toText(item))
    .filter(Boolean);
}

function buildDraftClientId(seed: string): string {
  return `draft:${seed}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export function createMemoryPreferenceDraftRecord(
  record?: Partial<MemoryScopeDraftRecord>,
): MemoryScopeDraftRecord {
  return {
    clientId: buildDraftClientId(toText(record?.id || record?.title || "new")),
    id: toText(record?.id) || undefined,
    title: toText(record?.title),
    summary: toText(record?.summary),
    category: toText(record?.category) || "general",
    importance:
      typeof record?.importance === "number" && Number.isFinite(record.importance)
        ? record.importance
        : 5,
    confidence:
      typeof record?.confidence === "number" && Number.isFinite(record.confidence)
        ? record.confidence
        : 0.8,
    tags: normalizeMemoryTagList(record?.tags),
    status:
      typeof (record as MemoryScopeDraftRecord | undefined)?.status === "string"
        ? toText((record as MemoryScopeDraftRecord).status)
        : undefined,
    scopeType:
      typeof (record as MemoryScopeDraftRecord | undefined)?.scopeType === "string"
        ? toText((record as MemoryScopeDraftRecord).scopeType)
        : undefined,
    scopeKey:
      typeof (record as MemoryScopeDraftRecord | undefined)?.scopeKey === "string"
        ? toText((record as MemoryScopeDraftRecord).scopeKey)
        : undefined,
    createdAt:
      typeof (record as MemoryScopeDraftRecord | undefined)?.createdAt === "number"
        ? (record as MemoryScopeDraftRecord).createdAt
        : undefined,
    updatedAt:
      typeof (record as MemoryScopeDraftRecord | undefined)?.updatedAt === "number"
        ? (record as MemoryScopeDraftRecord).updatedAt
        : undefined,
  };
}

export function hydratePreferenceDrafts(
  records: MemoryScopeRecord[],
): MemoryScopeDraftRecord[] {
  return records.map((record) =>
    createMemoryPreferenceDraftRecord({
      id: record.id,
      title: record.title,
      summary: record.summary,
      category: record.category,
      importance: record.importance,
      confidence: record.confidence,
      tags: record.tags,
      status: record.status,
      scopeType: record.scopeType,
      scopeKey: record.scopeKey,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }),
  );
}

export function toScopeRecordInputs(
  drafts: MemoryScopeDraftRecord[],
): MemoryScopeRecordInput[] {
  return drafts.map((draft) => ({
    ...(toText(draft.id) ? { id: toText(draft.id) } : {}),
    title: toText(draft.title),
    summary: toText(draft.summary),
    category: toText(draft.category) || "general",
    importance:
      typeof draft.importance === "number" && Number.isFinite(draft.importance)
        ? draft.importance
        : 5,
    confidence:
      typeof draft.confidence === "number" && Number.isFinite(draft.confidence)
        ? draft.confidence
        : 0.8,
    tags: normalizeMemoryTagList(draft.tags),
  }));
}

export interface LivePreferenceDraftValues {
  title?: string;
  summary?: string;
  category?: string;
  importance?: string | number;
  confidence?: string | number;
  tags?: string | string[];
}

export function syncSelectedPreferenceDraftFromLiveValues(
  drafts: MemoryScopeDraftRecord[],
  selectedRecordId: string,
  liveValues?: LivePreferenceDraftValues | null,
): MemoryScopeDraftRecord[] {
  if (!selectedRecordId || !liveValues) {
    return drafts;
  }

  const hasLiveValue = (
    liveValues.title !== undefined ||
    liveValues.summary !== undefined ||
    liveValues.category !== undefined ||
    liveValues.importance !== undefined ||
    liveValues.confidence !== undefined ||
    liveValues.tags !== undefined
  );
  if (!hasLiveValue) {
    return drafts;
  }

  return drafts.map((record) => {
    if (record.clientId !== selectedRecordId) {
      return record;
    }

    return {
      ...record,
      title:
        liveValues.title !== undefined
          ? toText(liveValues.title)
          : record.title,
      summary:
        liveValues.summary !== undefined
          ? toText(liveValues.summary)
          : record.summary,
      category:
        liveValues.category !== undefined
          ? toText(liveValues.category) || "general"
          : record.category,
      importance:
        liveValues.importance !== undefined
          ? Number.parseInt(String(liveValues.importance || "0"), 10) || 0
          : record.importance,
      confidence:
        liveValues.confidence !== undefined
          ? Number.parseFloat(String(liveValues.confidence || "0")) || 0
          : record.confidence,
      tags:
        liveValues.tags !== undefined
          ? Array.isArray(liveValues.tags)
            ? normalizeMemoryTagList(liveValues.tags)
            : liveValues.tags
                .split(/[,\n\uFF0C]/)
                .map((item) => toText(item))
                .filter(Boolean)
          : record.tags,
    };
  });
}

export function normalizePreferenceScopeType(
  value: string,
): MemoryPreferenceScopeType {
  switch (toText(value).toLowerCase()) {
    case "user":
      return "user";
    case "team":
      return "team";
    case "global":
      return "global";
    default:
      return "agent";
  }
}

export function preferredScopeTypeFromSummaries(
  scopes: MemoryScopeSummary[],
): MemoryPreferenceScopeType {
  const types = new Set(scopes.map((scope) => normalizePreferenceScopeType(scope.scopeType)));
  if (types.has("agent")) return "agent";
  if (types.has("user")) return "user";
  if (types.has("team")) return "team";
  return "global";
}

export function formatScopeTabLabel(scope: MemoryScopeSummary): string {
  const label = toText(scope.label || scope.scopeType).toUpperCase();
  if (typeof scope.recordCount === "number") {
    return `${label} (${scope.recordCount})`;
  }
  return label;
}
