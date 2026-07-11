import type { TimelineNode } from "@/app/state/types";
import type {
  BTWSessionState,
  BTWTranscriptItem,
  PersistedBTWSession,
} from "@/features/btw/lib/btwTypes";

export const BTW_SESSION_STORAGE_KEY = "agent-webclient:btw:v1";
export const BTW_SESSION_STORAGE_VERSION = 1;
export const BTW_MAX_STORED_CHATS = 20;
export const BTW_MAX_TRANSCRIPT_ITEMS = 50;
export const BTW_MAX_STORAGE_BYTES = 2 * 1024 * 1024;

interface BTWStorageEnvelope {
  version: number;
  sessions: PersistedBTWSession[];
}

function getSessionStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function normalizeTranscriptItem(value: unknown): BTWTranscriptItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const role = String(record.role || "");
  const text = String(record.text || "");
  if (role !== "user" && role !== "assistant" && role !== "system") return null;
  if (!text.trim()) return null;
  const timestamp = Number(record.timestamp);
  return {
    id: String(record.id || `btw_restore_${Date.now()}`),
    role,
    text,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
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
  return {
    parentChatId,
    btwId: String(record.btwId || "").trim(),
    runId: String(record.runId || "").trim(),
    requestId: String(record.requestId || "").trim(),
    agentKey: String(record.agentKey || "").trim(),
    status,
    draft: String(record.draft || ""),
    lastSeq: Math.max(0, Number(record.lastSeq) || 0),
    updatedAt: Number(record.updatedAt) || Date.now(),
    config,
    transcript,
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

function nodeToTranscript(node: TimelineNode): BTWTranscriptItem | null {
  const text = String(node.text || "");
  if (!text.trim()) return null;
  if (node.kind === "message" && node.role === "user") {
    return {
      id: node.id,
      role: "user",
      text,
      timestamp: node.ts || Date.now(),
      attachments: node.attachments,
    };
  }
  if (node.kind === "message" && node.role === "system") {
    return {
      id: node.id,
      role: "system",
      text,
      timestamp: node.ts || Date.now(),
    };
  }
  if (node.kind === "content") {
    return {
      id: node.id,
      role: "assistant",
      text,
      timestamp: node.ts || Date.now(),
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
  return {
    parentChatId: session.parentChatId,
    btwId: session.btwId,
    runId: session.runId,
    requestId: session.requestId,
    agentKey: session.agentKey,
    status: session.status,
    draft: session.draft,
    lastSeq: session.lastSeq,
    updatedAt: session.updatedAt,
    config: session.config,
    transcript: buildBTWTranscript(session),
  };
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
    const values = Array.from(sessions)
      .map(toPersistedSession)
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
