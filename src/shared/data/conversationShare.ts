import { readRuntimeConfigValue } from "@/shared/config/runtimeConfig";

const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/u;
const SHARE_PATH_PATTERN = /^\/share\/([A-Za-z0-9_-]{1,80})\/?$/u;
const SHARE_REQUEST_TIMEOUT_MS = 6000;
const MAX_SHARE_BYTES = 2 << 20;
const MAX_SHARE_EVENTS = 2000;
const MAX_SHARE_CONTENT_BYTES = 200_000;
const MAX_SHARE_TITLE_BYTES = 300;
const MAX_SHARE_LABEL_BYTES = 300;
const SHARE_FRAME_PREFIX = "event: message\ndata: ";
const UTF8_ENCODER = new TextEncoder();

export type SharedConversationUserMessage = {
  kind: "user-message";
  content: string;
  createdAt: number;
};

export type SharedConversationAssistantReasoning = {
  kind: "assistant-reasoning";
  content: string;
  label?: string;
  createdAt: number;
};

export type SharedConversationAssistantMessage = {
  kind: "assistant-message";
  content: string;
  createdAt: number;
};

export type SharedConversationItem =
  | SharedConversationUserMessage
  | SharedConversationAssistantReasoning
  | SharedConversationAssistantMessage;

export type SharedConversationAssistantItem =
  | SharedConversationAssistantReasoning
  | SharedConversationAssistantMessage;

export type SharedConversationTurn = {
  startedAt: number;
  completedAt?: number;
  items: [SharedConversationUserMessage, ...SharedConversationAssistantItem[]];
};

export type SharedConversationTranscript = {
  metadata: {
    exportVersion: 1;
    kind: "chat-transcript";
    title: string;
    createdAt: number;
    updatedAt: number;
  };
  turns: SharedConversationTurn[];
};

export type ConversationShareErrorCode =
  | "invalid-id"
  | "unavailable"
  | "unsupported"
  | "timeout"
  | "network";

export class ConversationShareError extends Error {
  readonly code: ConversationShareErrorCode;

  constructor(code: ConversationShareErrorCode) {
    super(code);
    this.name = "ConversationShareError";
    this.code = code;
  }
}

export function readConversationShareId(pathname: string): string | null {
  return SHARE_PATH_PATTERN.exec(pathname)?.[1] || null;
}

export function getSafeConversationShareHref(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function getConversationShareDownloadUrl(): string | null {
  return getSafeConversationShareHref(
    readRuntimeConfigValue("SHARE_APP_DOWNLOAD_URL"),
  );
}

export function parseSharedConversationEventStream(
  value: string,
): SharedConversationTranscript | null {
  if (utf8Bytes(value) > MAX_SHARE_BYTES) return null;
  return parseDecodedShareEventStream(value);
}

export async function getPublicConversationShare(
  shareId: string,
  signal?: AbortSignal,
): Promise<SharedConversationTranscript> {
  if (!SHARE_ID_PATTERN.test(shareId)) {
    throw new ConversationShareError("invalid-id");
  }

  const controller = new AbortController();
  const handleExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", handleExternalAbort, { once: true });
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    SHARE_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `/api/public/shares/${encodeURIComponent(shareId)}`,
      {
        method: "GET",
        headers: { Accept: "text/event-stream" },
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      },
    );
    if (response.status === 404 || response.status === 410) {
      throw new ConversationShareError("unavailable");
    }
    if (!response.ok) {
      throw new ConversationShareError("network");
    }
    const contentType = response.headers.get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== "text/event-stream") {
      throw new ConversationShareError("unsupported");
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_SHARE_BYTES) {
      throw new ConversationShareError("unsupported");
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_SHARE_BYTES) {
      throw new ConversationShareError("unsupported");
    }
    let decoded: string;
    try {
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new ConversationShareError("unsupported");
    }
    const transcript = parseDecodedShareEventStream(decoded);
    if (!transcript) {
      throw new ConversationShareError("unsupported");
    }
    return transcript;
  } catch (error: unknown) {
    if (error instanceof ConversationShareError) throw error;
    if (controller.signal.aborted) {
      if (signal?.aborted) throw error;
      throw new ConversationShareError("timeout");
    }
    throw new ConversationShareError("network");
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", handleExternalAbort);
  }
}

function parseDecodedShareEventStream(value: string): SharedConversationTranscript | null {
  if (!value.endsWith("\n\n")) return null;

  const turns: SharedConversationTurn[] = [];
  let cursor = 0;
  let expectedSeq = 1;
  let eventCount = 0;
  let title = "";
  let createdAt = 0;
  let updatedAt = 0;
  let currentTurn: SharedConversationTurn | null = null;
  let runStarted = false;
  let snapshotsStarted = false;
  let lastTurnTimestamp = 0;
  let done = false;

  while (cursor < value.length) {
    const boundary = value.indexOf("\n\n", cursor);
    if (boundary < 0) return null;
    const frame = value.slice(cursor, boundary);
    cursor = boundary + 2;
    if (!frame.startsWith(SHARE_FRAME_PREFIX)) return null;
    const data = frame.slice(SHARE_FRAME_PREFIX.length);
    if (!data || data.includes("\n") || data.includes("\r")) return null;
    if (data === "[DONE]") {
      if (cursor !== value.length || expectedSeq === 1 || turns.length === 0) return null;
      done = true;
      break;
    }

    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      return null;
    }
    if (!isRecord(event) || event.seq !== expectedSeq || !isEpochMilliseconds(event.timestamp)) {
      return null;
    }
    expectedSeq++;
    updatedAt = Math.max(updatedAt, event.timestamp);

    if (event.seq === 1) {
      if (
        !hasExactKeys(event, ["seq", "type", "shareVersion", "chatName", "timestamp"])
        || event.type !== "chat.start"
        || event.shareVersion !== 1
        || typeof event.chatName !== "string"
      ) return null;
      title = event.chatName.trim();
      if (!title || utf8Bytes(event.chatName) > MAX_SHARE_TITLE_BYTES) return null;
      createdAt = event.timestamp;
      continue;
    }

    eventCount++;
    if (eventCount > MAX_SHARE_EVENTS || typeof event.type !== "string") return null;
    switch (event.type) {
      case "request.query": {
        if (
          currentTurn
          || !hasExactKeys(event, ["seq", "type", "message", "timestamp"])
          || !isValidContent(event.message)
        ) return null;
        const userMessage: SharedConversationUserMessage = {
          kind: "user-message",
          content: event.message,
          createdAt: event.timestamp,
        };
        currentTurn = { startedAt: event.timestamp, items: [userMessage] };
        turns.push(currentTurn);
        runStarted = false;
        snapshotsStarted = false;
        lastTurnTimestamp = event.timestamp;
        break;
      }
      case "run.start":
        if (
          !currentTurn
          || runStarted
          || snapshotsStarted
          || event.timestamp < lastTurnTimestamp
          || !hasExactKeys(event, ["seq", "type", "timestamp"])
        ) return null;
        currentTurn.startedAt = event.timestamp;
        runStarted = true;
        lastTurnTimestamp = event.timestamp;
        break;
      case "reasoning.snapshot": {
        if (
          !currentTurn
          || event.timestamp < lastTurnTimestamp
          || !hasExactOrOptionalReasoningKeys(event)
          || !isValidContent(event.text)
          || (event.reasoningLabel !== undefined
            && (typeof event.reasoningLabel !== "string" || utf8Bytes(event.reasoningLabel) > MAX_SHARE_LABEL_BYTES))
        ) return null;
        currentTurn.items.push({
          kind: "assistant-reasoning",
          content: event.text,
          ...(typeof event.reasoningLabel === "string" && event.reasoningLabel.trim()
            ? { label: event.reasoningLabel.trim() }
            : {}),
          createdAt: event.timestamp,
        });
        snapshotsStarted = true;
        lastTurnTimestamp = event.timestamp;
        break;
      }
      case "content.snapshot":
        if (
          !currentTurn
          || event.timestamp < lastTurnTimestamp
          || !hasExactKeys(event, ["seq", "type", "text", "timestamp"])
          || !isValidContent(event.text)
        ) return null;
        currentTurn.items.push({
          kind: "assistant-message",
          content: event.text,
          createdAt: event.timestamp,
        });
        snapshotsStarted = true;
        lastTurnTimestamp = event.timestamp;
        break;
      case "run.complete":
      case "run.cancel":
      case "run.error":
        if (
          !currentTurn
          || event.timestamp < lastTurnTimestamp
          || !hasExactKeys(event, ["seq", "type", "timestamp"])
        ) return null;
        currentTurn.completedAt = event.timestamp;
        currentTurn = null;
        break;
      default:
        return null;
    }
  }

  if (!done) return null;
  return {
    metadata: {
      exportVersion: 1,
      kind: "chat-transcript",
      title,
      createdAt,
      updatedAt,
    },
    turns,
  };
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function hasExactOrOptionalReasoningKeys(record: Record<string, unknown>): boolean {
  return hasExactKeys(record, ["seq", "type", "text", "timestamp"])
    || hasExactKeys(record, ["seq", "type", "text", "reasoningLabel", "timestamp"]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEpochMilliseconds(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1_000_000_000_000;
}

function isValidContent(value: unknown): value is string {
  return typeof value === "string"
    && value.trim() !== ""
    && utf8Bytes(value) <= MAX_SHARE_CONTENT_BYTES;
}

function utf8Bytes(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}
