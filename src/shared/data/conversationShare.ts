import { readRuntimeConfigValue } from "@/shared/config/runtimeConfig";

const SHARE_ID_PATTERN = /^share_[A-Za-z0-9_-]+$/u;
const SHARE_PATH_PATTERN = /^\/share\/(share_[A-Za-z0-9_-]+)\/?$/u;
const SHARE_REQUEST_TIMEOUT_MS = 6000;

export type SharedConversationMessageEntry = {
  type: "message";
  role: "user" | "assistant";
  content: string;
  createdAt?: number;
};

export type SharedConversationReasoningEntry = {
  type: "reasoning";
  content: string;
  label?: string;
  durationMs?: number;
  createdAt?: number;
};

export type SharedConversationEntry =
  | SharedConversationMessageEntry
  | SharedConversationReasoningEntry;

export type SharedConversationSnapshot = {
  schemaVersion: 1;
  title: string;
  createdAt: number;
  updatedAt: number;
  entries: SharedConversationEntry[];
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

export function buildConversationSharePath(value: unknown): string {
  const shareId = typeof value === "string" ? value.trim() : "";
  return SHARE_ID_PATTERN.test(shareId)
    ? `/share/${encodeURIComponent(shareId)}`
    : "";
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

export function parseSharedConversationSnapshot(
  value: unknown,
): SharedConversationSnapshot | null {
  if (!isRecord(value)) return null;
  if (
    !hasOnlyKeys(value, ["schemaVersion", "title", "createdAt", "updatedAt", "entries"])
    || value.schemaVersion !== 1
    || typeof value.title !== "string"
    || !isEpochMilliseconds(value.createdAt)
    || !isEpochMilliseconds(value.updatedAt)
    || value.updatedAt < value.createdAt
    || !Array.isArray(value.entries)
    || value.entries.length === 0
  ) {
    return null;
  }

  const entries: SharedConversationEntry[] = [];
  for (const candidate of value.entries) {
    if (
      !isRecord(candidate)
      || typeof candidate.content !== "string"
      || candidate.content.trim() === ""
      || (candidate.createdAt !== undefined && !isEpochMilliseconds(candidate.createdAt))
    ) {
      return null;
    }
    if (candidate.type === "message") {
      if (
        (candidate.role !== "user" && candidate.role !== "assistant")
        || candidate.label !== undefined
        || !hasOnlyKeys(candidate, ["type", "role", "content", "createdAt"])
      ) {
        return null;
      }
      entries.push({
        type: "message",
        role: candidate.role,
        content: candidate.content,
        ...(candidate.createdAt === undefined ? {} : { createdAt: candidate.createdAt }),
      });
      continue;
    }
    if (
      candidate.type !== "reasoning"
      || candidate.role !== undefined
      || (candidate.label !== undefined && typeof candidate.label !== "string")
      || (candidate.durationMs !== undefined && !isDurationMilliseconds(candidate.durationMs))
      || !hasOnlyKeys(candidate, ["type", "content", "label", "durationMs", "createdAt"])
    ) {
      return null;
    }
    entries.push({
      type: "reasoning",
      content: candidate.content,
      ...(typeof candidate.label === "string" && candidate.label.trim()
        ? { label: candidate.label.trim() }
        : {}),
      ...(candidate.durationMs === undefined ? {} : { durationMs: candidate.durationMs }),
      ...(candidate.createdAt === undefined ? {} : { createdAt: candidate.createdAt }),
    });
  }

  return {
    schemaVersion: 1,
    title: value.title,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    entries,
  };
}

export async function getPublicConversationShare(
  shareId: string,
  signal?: AbortSignal,
): Promise<SharedConversationSnapshot> {
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
        headers: { Accept: "application/json" },
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

    const snapshot = parseSharedConversationSnapshot(await response.json());
    if (!snapshot) {
      throw new ConversationShareError("unsupported");
    }
    return snapshot;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function hasOnlyKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function isEpochMilliseconds(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= 1_000_000_000_000;
}

function isDurationMilliseconds(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0;
}
