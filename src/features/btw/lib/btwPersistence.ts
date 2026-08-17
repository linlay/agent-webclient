import type { TimelineNode } from "@/app/state/types";
import type {
  BTWSessionState,
  BTWTranscriptItem,
  PersistedBTWSession,
} from "@/features/btw/lib/btwTypes";
import { readEpochMillis } from "@/shared/utils/platformTime";
import { toRunOwner } from "@/shared/data/runOwner";

export const BTW_SESSION_STORAGE_KEY = "agent-webclient:btw:v2";
export const BTW_SESSION_STORAGE_VERSION = 2;
export const BTW_MAX_STORED_CHATS = 20;
export const BTW_MAX_TRANSCRIPT_ITEMS = 50;
export const BTW_MAX_STORAGE_BYTES = 2 * 1024 * 1024;

interface BTWStorageEnvelope {
  version: number;
  sessions: PersistedBTWSession[];
}

function getSessionStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function persistedSessionKey(session: Pick<PersistedBTWSession, "agentKey" | "parentChatId" | "btwId">): string {
  return [session.agentKey, session.parentChatId, session.btwId || "__current__"].join("\u0000");
}

function normalizeTranscriptItem(value: unknown): BTWTranscriptItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const role = String(record.role || "");
  const text = String(record.text || "");
  if (role !== "user" && role !== "assistant" && role !== "system") return null;
  if (!text.trim()) return null;
  const timestamp = readEpochMillis(record.timestamp);
  if (timestamp === undefined) return null;
  return {
    id: String(record.id || `btw_restore_${Date.now()}`),
    role,
    text,
    timestamp,
    attachments: Array.isArray(record.attachments)
      ? (record.attachments as BTWTranscriptItem["attachments"])
      : undefined,
  };
}

function normalizePersistedSession(value: unknown): PersistedBTWSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const parentChatId = String(record.parentChatId || "").trim();
  if (!parentChatId) return null;
  const rawStatus = String(record.status || "");
  const status =
    rawStatus === "running" || rawStatus === "error" ? rawStatus : "idle";
  const transcript = Array.isArray(record.transcript)
    ? record.transcript
        .map(normalizeTranscriptItem)
        .filter((item): item is BTWTranscriptItem => Boolean(item))
        .slice(-BTW_MAX_TRANSCRIPT_ITEMS)
    : [];
  const config =
    record.config && typeof record.config === "object" && !Array.isArray(record.config)
      ? (record.config as PersistedBTWSession["config"])
      : {};
  const updatedAt = readEpochMillis(record.updatedAt);
  if (updatedAt === undefined) return null;
  const owner =
    toRunOwner(record.owner as Record<string, unknown> | undefined)
    || toRunOwner({ teamId: record.teamId, agentKey: record.agentKey });
  return {
    parentChatId,
    btwId: String(record.btwId || "").trim(),
    runId: String(record.runId || "").trim(),
    requestId: String(record.requestId || "").trim(),
    agentKey: owner?.kind === "agent" ? owner.agentKey : "",
    owner: owner || undefined,
    status,
    draft: String(record.draft || ""),
    lastSeq: Math.max(0, Number(record.lastSeq) || 0),
    updatedAt,
    config,
    transcript,
    sourceNodes: Array.isArray(record.sourceNodes)
      ? record.sourceNodes
          .filter((node): node is TimelineNode => Boolean(
            node &&
            typeof node === "object" &&
            !Array.isArray(node) &&
            String((node as TimelineNode).id || "").trim() &&
            (node as TimelineNode).kind === "source",
          ))
          .slice(-BTW_MAX_TRANSCRIPT_ITEMS)
      : undefined,
  };
}

export function readPersistedBTWSessions(): PersistedBTWSession[] {
  const storage = getSessionStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(BTW_SESSION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BTWStorageEnvelope;
    if (parsed?.version !== BTW_SESSION_STORAGE_VERSION || !Array.isArray(parsed.sessions)) {
      return [];
    }
    return parsed.sessions
      .map(normalizePersistedSession)
      .filter((item): item is PersistedBTWSession => Boolean(item))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, BTW_MAX_STORED_CHATS);
  } catch {
    return [];
  }
}

export function findPersistedBTWSession(input: {
  agentKey?: string;
  parentChatId: string;
  btwId: string;
}): PersistedBTWSession | null {
  const agentKey = String(input.agentKey || "").trim();
  const parentChatId = String(input.parentChatId || "").trim();
  const btwId = String(input.btwId || "").trim();
  if (!parentChatId || !btwId) return null;
  return readPersistedBTWSessions().find((session) =>
    session.parentChatId === parentChatId &&
    session.btwId === btwId &&
    (!agentKey || !session.agentKey || session.agentKey === agentKey),
  ) || null;
}

function nodeToTranscript(node: TimelineNode): BTWTranscriptItem | null {
  const text = String(node.text || "");
  const timestamp = readEpochMillis(node.ts);
  if (timestamp === undefined) return null;
  if (!text.trim()) return null;
  if (node.kind === "message" && node.role === "user") {
    return {
      id: node.id,
      role: "user",
      text,
      timestamp,
      attachments: node.attachments,
    };
  }
  if (node.kind === "message" && node.role === "system") {
    return {
      id: node.id,
      role: "system",
      text,
      timestamp,
    };
  }
  if (node.kind === "content") {
    return {
      id: node.id,
      role: "assistant",
      text,
      timestamp,
    };
  }
  return null;
}

export function buildBTWTranscript(session: BTWSessionState): BTWTranscriptItem[] {
  const items = session.projection.timelineOrder
    .map((id) => session.projection.timelineNodes.get(id))
    .filter((node): node is TimelineNode => Boolean(node))
    .map(nodeToTranscript)
    .filter((item): item is BTWTranscriptItem => Boolean(item));

  if (session.status === "running") {
    let latestUserIndex = -1;
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (items[index].role === "user") {
        latestUserIndex = index;
        break;
      }
    }
    if (latestUserIndex >= 0) {
      return items.slice(0, latestUserIndex + 1).slice(-BTW_MAX_TRANSCRIPT_ITEMS);
    }
  }
  return items.slice(-BTW_MAX_TRANSCRIPT_ITEMS);
}

function toPersistedSession(session: BTWSessionState): PersistedBTWSession {
  const sourceNodes = session.projection.timelineOrder
    .map((id) => session.projection.timelineNodes.get(id))
    .filter((node): node is TimelineNode => Boolean(node?.kind === "source"))
    .slice(-BTW_MAX_TRANSCRIPT_ITEMS)
    .map((node) => ({
      ...node,
      sources: node.sources?.map((source) => ({
        ...source,
        chunks: source.chunks.map((chunk) => ({ ...chunk })),
      })),
    }));
  return {
    parentChatId: session.parentChatId,
    btwId: session.btwId,
    runId: session.runId,
    requestId: session.requestId,
    agentKey: session.agentKey,
    owner: session.owner,
    status: session.status,
    draft: session.draft,
    lastSeq: session.lastSeq,
    updatedAt: session.updatedAt,
    config: session.config,
    transcript: buildBTWTranscript(session),
    ...(sourceNodes.length > 0 ? { sourceNodes } : {}),
  };
}

export function findPersistedBTWSource(input: {
  agentKey?: string;
  parentChatId: string;
  btwId: string;
  publishId: string;
  sourceId: string;
}) {
  const session = findPersistedBTWSession(input);
  const node = session?.sourceNodes?.find(
    (candidate) => candidate.sourcePublishId === String(input.publishId || "").trim(),
  );
  return node?.sources?.find(
    (source) => source.id === String(input.sourceId || "").trim(),
  ) || null;
}

function encodedEnvelope(sessions: PersistedBTWSession[]): string {
  return JSON.stringify({
    version: BTW_SESSION_STORAGE_VERSION,
    sessions,
  } satisfies BTWStorageEnvelope);
}

function encodedSize(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).byteLength;
  }
  return value.length * 2;
}

export function persistBTWSessions(sessions: Iterable<BTWSessionState>): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    const current = Array.from(sessions).map(toPersistedSession);
    const merged = new Map<string, PersistedBTWSession>();
    for (const session of [...current, ...readPersistedBTWSessions()]) {
      const key = persistedSessionKey(session);
      const existing = merged.get(key);
      if (!existing || session.updatedAt > existing.updatedAt) merged.set(key, session);
    }
    const values = Array.from(merged.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, BTW_MAX_STORED_CHATS);
    let raw = encodedEnvelope(values);
    while (encodedSize(raw) > BTW_MAX_STORAGE_BYTES && values.length > 1) {
      values.pop();
      raw = encodedEnvelope(values);
    }
    if (raw.length > BTW_MAX_STORAGE_BYTES && values[0]) {
      while (
        encodedSize(raw) > BTW_MAX_STORAGE_BYTES &&
        values[0].transcript.length > 2
      ) {
        values[0].transcript.shift();
        raw = encodedEnvelope(values);
      }
    }
    storage.setItem(BTW_SESSION_STORAGE_KEY, raw);
  } catch {
    // Session persistence is best-effort; the backend branch remains authoritative.
  }
}

export function removePersistedBTWSessions(parentChatId: string): void {
  const storage = getSessionStorage();
  const normalized = String(parentChatId || "").trim();
  if (!storage || !normalized) return;
  try {
    const values = readPersistedBTWSessions().filter(
      (session) => session.parentChatId !== normalized,
    );
    storage.setItem(BTW_SESSION_STORAGE_KEY, encodedEnvelope(values));
  } catch {
    // Removal is best-effort for the same reason as persistence.
  }
}
