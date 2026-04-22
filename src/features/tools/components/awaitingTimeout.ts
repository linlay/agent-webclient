import { useEffect, useMemo, useRef, useState } from "react";

const COUNTDOWN_TICK_MS = 250;

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

interface UseAwaitingTimeoutCountdownInput {
  awaitingKey: string;
  timeout: number | null | undefined;
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
  const { awaitingKey, timeout, onExpire } = input;
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
    expiredRef.current = false;
    setNow(Date.now());
    setDeadlineAt(timeoutMs ? Date.now() + timeoutMs : null);
  }, [awaitingKey, timeoutMs]);

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
      onExpireRef.current?.();
    };

    tick();
    const timer = window.setInterval(tick, COUNTDOWN_TICK_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [deadlineAt]);

  const remainingMs =
    deadlineAt === null ? null : Math.max(0, deadlineAt - now);

  return {
    expired: remainingMs === 0,
    label: remainingMs === null ? null : formatAwaitingTimeoutLabel(remainingMs),
    remainingMs,
  };
}
