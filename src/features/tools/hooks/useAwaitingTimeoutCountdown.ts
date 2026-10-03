import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeAwaitingTimeoutMs, resolveAwaitingTimeoutEntry, markAwaitingTimeoutExpired, formatAwaitingTimeoutLabel } from "../lib/awaitingTimeout";
const COUNTDOWN_TICK_MS = 250;

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
