import {
  formatAwaitingTimeoutLabel,
  markAwaitingTimeoutExpired,
  normalizeAwaitingTimeoutMs,
  resetAwaitingTimeoutEntries,
  resolveAwaitingTimeoutEntry,
} from "@/features/tools/components/awaitingTimeout";

describe("awaiting timeout helpers", () => {
  afterEach(() => {
    resetAwaitingTimeoutEntries();
  });

  it("normalizes small timeout values as seconds and large ones as milliseconds", () => {
    expect(normalizeAwaitingTimeoutMs(null)).toBeNull();
    expect(normalizeAwaitingTimeoutMs(0)).toBeNull();
    expect(normalizeAwaitingTimeoutMs(60)).toBe(60000);
    expect(normalizeAwaitingTimeoutMs(120000)).toBe(120000);
  });

  it("formats countdown labels for minute and hour ranges", () => {
    expect(formatAwaitingTimeoutLabel(59001)).toBe("1:00");
    expect(formatAwaitingTimeoutLabel(9000)).toBe("0:09");
    expect(formatAwaitingTimeoutLabel(3661000)).toBe("1:01:01");
  });

  it("reuses the same deadline for the same awaiting key", () => {
    const timeoutMs = normalizeAwaitingTimeoutMs(60);

    expect(resolveAwaitingTimeoutEntry("run#await", timeoutMs, 1000)).toEqual({
      deadlineAt: 61000,
      didExpire: false,
    });
    expect(resolveAwaitingTimeoutEntry("run#await", timeoutMs, 15000)).toEqual({
      deadlineAt: 61000,
      didExpire: false,
    });
  });

  it("remembers when an awaiting key has already expired", () => {
    const timeoutMs = normalizeAwaitingTimeoutMs(30);

    expect(resolveAwaitingTimeoutEntry("run#await", timeoutMs, 5000)).toEqual({
      deadlineAt: 35000,
      didExpire: false,
    });

    markAwaitingTimeoutExpired("run#await", 35000);

    expect(resolveAwaitingTimeoutEntry("run#await", timeoutMs, 45000)).toEqual({
      deadlineAt: 35000,
      didExpire: true,
    });
  });

  it("clears a cached entry when timeout becomes unavailable", () => {
    const timeoutMs = normalizeAwaitingTimeoutMs(10);

    expect(resolveAwaitingTimeoutEntry("run#await", timeoutMs, 2000)).toEqual({
      deadlineAt: 12000,
      didExpire: false,
    });
    expect(resolveAwaitingTimeoutEntry("run#await", null, 4000)).toBeNull();
    expect(resolveAwaitingTimeoutEntry("run#await", timeoutMs, 7000)).toEqual({
      deadlineAt: 17000,
      didExpire: false,
    });
  });

  it("uses createdAt as the countdown start so refresh does not restart the timer", () => {
    const timeoutMs = normalizeAwaitingTimeoutMs(60);

    expect(
      resolveAwaitingTimeoutEntry("run#await", timeoutMs, 50000, 1000),
    ).toEqual({
      deadlineAt: 61000,
      didExpire: false,
    });

    expect(
      resolveAwaitingTimeoutEntry("run#await-reloaded", timeoutMs, 50000, 1000),
    ).toEqual({
      deadlineAt: 61000,
      didExpire: false,
    });
  });

  it("marks createdAt-based entries expired immediately when the deadline already passed", () => {
    const timeoutMs = normalizeAwaitingTimeoutMs(30);

    expect(
      resolveAwaitingTimeoutEntry("run#await", timeoutMs, 40000, 1000),
    ).toEqual({
      deadlineAt: 31000,
      didExpire: true,
    });
  });
});
