import { readEpochMillis } from "@/shared/utils/platformTime";

const MAX_AWAITING_TIMEOUT_CACHE_SIZE = 200;

interface AwaitingTimeoutEntry {
  deadlineAt: number;
  didExpire: boolean;
}

const awaitingTimeoutByKey = new Map<string, AwaitingTimeoutEntry>();

export function normalizeAwaitingTimeoutMs(
  timeout: number | null | undefined,
): number | null {
  if (!Number.isFinite(timeout)) {
    return null;
  }
  const normalized = Number(timeout);
  if (normalized <= 0) {
    return null;
  }
  return normalized < 1000 ? Math.round(normalized * 1000) : Math.round(normalized);
}

export function formatAwaitingTimeoutLabel(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function pruneAwaitingTimeoutCache() {
  while (awaitingTimeoutByKey.size > MAX_AWAITING_TIMEOUT_CACHE_SIZE) {
    const oldestKey = awaitingTimeoutByKey.keys().next().value;
    if (!oldestKey) {
      return;
    }
    awaitingTimeoutByKey.delete(oldestKey);
  }
}

export function resolveAwaitingTimeoutEntry(
  awaitingKey: string,
  timeoutMs: number | null,
  now = Date.now(),
  createdAt?: number | null,
): AwaitingTimeoutEntry | null {
  if (timeoutMs === null) {
    if (awaitingKey) {
      awaitingTimeoutByKey.delete(awaitingKey);
    }
    return null;
  }

  const cachedEntry = awaitingKey
    ? awaitingTimeoutByKey.get(awaitingKey)
    : undefined;
  const normalizedCreatedAt = Number.isFinite(createdAt)
    ? Number(createdAt)
    : readEpochMillis(createdAt);
  const expectedDeadlineAt = normalizedCreatedAt !== undefined
    ? normalizedCreatedAt + timeoutMs
    : cachedEntry?.deadlineAt ?? now + timeoutMs;
  if (cachedEntry && cachedEntry.deadlineAt === expectedDeadlineAt) {
    return cachedEntry;
  }

  const nextEntry = {
    deadlineAt: expectedDeadlineAt,
    didExpire:
      cachedEntry?.didExpire === true
      || expectedDeadlineAt <= now,
  };
  if (awaitingKey) {
    awaitingTimeoutByKey.set(awaitingKey, nextEntry);
    pruneAwaitingTimeoutCache();
  }
  return nextEntry;
}

export function markAwaitingTimeoutExpired(
  awaitingKey: string,
  deadlineAt: number,
) {
  if (!awaitingKey) {
    return;
  }

  const cachedEntry = awaitingTimeoutByKey.get(awaitingKey);
  if (!cachedEntry) {
    awaitingTimeoutByKey.set(awaitingKey, {
      deadlineAt,
      didExpire: true,
    });
    pruneAwaitingTimeoutCache();
    return;
  }

  awaitingTimeoutByKey.set(awaitingKey, {
    deadlineAt: cachedEntry.deadlineAt,
    didExpire: true,
  });
}

export function resetAwaitingTimeoutEntries() {
  awaitingTimeoutByKey.clear();
}
