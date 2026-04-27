import { useEffect, useMemo, useRef, useState } from "react";

const COUNTDOWN_TICK_MS = 250;
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

  const normalizedCreatedAt = Number(createdAt);
  const hasCreatedAt =
    Number.isFinite(normalizedCreatedAt) && normalizedCreatedAt > 0;
  const expectedDeadlineAt =
    hasCreatedAt
      ? normalizedCreatedAt + timeoutMs
      : now + timeoutMs;
  const cachedEntry = awaitingKey
    ? awaitingTimeoutByKey.get(awaitingKey)
    : undefined;
  if (cachedEntry && (!hasCreatedAt || cachedEntry.deadlineAt === expectedDeadlineAt)) {
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

interface UseAwaitingTimeoutCountdownInput {
  awaitingKey: string;
  timeout: number | null | undefined;
  createdAt?: number | null;
  onExpire?: () => void;
}

interface AwaitingTimeoutCountdownState {
  expired: boolean;
  label: string | null;
  remainingMs: number | null;
}

export function useAwaitingTimeoutCountdown(
  input: UseAwaitingTimeoutCountdownInput,
): AwaitingTimeoutCountdownState {
  const { awaitingKey, timeout, createdAt, onExpire } = input;
  const timeoutMs = useMemo(
    () => normalizeAwaitingTimeoutMs(timeout),
    [timeout],
  );
  const onExpireRef = useRef(onExpire);
  const expiredRef = useRef(false);
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const nextNow = Date.now();
    const timeoutEntry = resolveAwaitingTimeoutEntry(
      awaitingKey,
      timeoutMs,
      nextNow,
      createdAt,
    );
    expiredRef.current = timeoutEntry?.didExpire ?? false;
    setNow(nextNow);
    setDeadlineAt(timeoutEntry?.deadlineAt ?? null);
  }, [awaitingKey, createdAt, timeoutMs]);

  useEffect(() => {
    if (!deadlineAt) {
      return;
    }

    const tick = () => {
      const nextNow = Date.now();
      setNow(nextNow);

      if (expiredRef.current || nextNow < deadlineAt) {
        return;
      }

      expiredRef.current = true;
      markAwaitingTimeoutExpired(awaitingKey, deadlineAt);
      onExpireRef.current?.();
    };

    tick();
    const timer = window.setInterval(tick, COUNTDOWN_TICK_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [awaitingKey, deadlineAt]);

  const remainingMs =
    deadlineAt === null ? null : Math.max(0, deadlineAt - now);

  return {
    expired: remainingMs === 0,
    label: remainingMs === null ? null : formatAwaitingTimeoutLabel(remainingMs),
    remainingMs,
  };
}
