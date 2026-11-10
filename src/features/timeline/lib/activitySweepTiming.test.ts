import {
  ACTIVITY_SWEEP_BAND_PX,
  ACTIVITY_SWEEP_BASE_PERIOD_SEC,
  ACTIVITY_SWEEP_MIN_REST_SEC,
  ACTIVITY_SWEEP_SPEED_PX_PER_SEC,
  getActivitySweepTiming,
} from "./activitySweepTiming";

const sweepSecOf = (width: number) => (width + ACTIVITY_SWEEP_BAND_PX) / ACTIVITY_SWEEP_SPEED_PX_PER_SEC;

describe("getActivitySweepTiming", () => {
  it("returns null when there is no measurable text", () => {
    expect(getActivitySweepTiming(0)).toBeNull();
    expect(getActivitySweepTiming(Number.NaN)).toBeNull();
  });

  it("keeps the 10 second cycle for short text", () => {
    const timing = getActivitySweepTiming(60)!;
    expect(timing.periodSec).toBe(ACTIVITY_SWEEP_BASE_PERIOD_SEC);
    expect(timing.sweepEndRatio * timing.periodSec).toBeCloseTo(sweepSecOf(60));
  });

  it("moves at one constant speed regardless of text width", () => {
    for (const width of [80, 200, 500]) {
      const timing = getActivitySweepTiming(width)!;
      const distance = width + ACTIVITY_SWEEP_BAND_PX;
      const seconds = timing.sweepEndRatio * timing.periodSec;
      expect(distance / seconds).toBeCloseTo(ACTIVITY_SWEEP_SPEED_PX_PER_SEC);
    }
  });

  it("extends the cycle for long text and keeps at least the minimum rest", () => {
    // At 320 px/s, a sweep must exceed the 10s base period plus the 2s rest before the cycle grows.
    const width = 3000;
    expect(sweepSecOf(width)).toBeGreaterThan(ACTIVITY_SWEEP_BASE_PERIOD_SEC - ACTIVITY_SWEEP_MIN_REST_SEC);
    const timing = getActivitySweepTiming(width)!;
    expect(timing.periodSec).toBeCloseTo(sweepSecOf(width) + ACTIVITY_SWEEP_MIN_REST_SEC);
    expect(timing.sweepEndRatio).toBeLessThan(1);
  });
});
