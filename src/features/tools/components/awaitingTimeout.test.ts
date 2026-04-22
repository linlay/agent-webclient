import {
  formatAwaitingTimeoutLabel,
  normalizeAwaitingTimeoutMs,
} from "@/features/tools/components/awaitingTimeout";

describe("awaiting timeout helpers", () => {
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
});
