/** Constant horizontal speed of the activity highlight band, in CSS pixels per second. */
export const ACTIVITY_SWEEP_SPEED_PX_PER_SEC = 320;
/** Width of the highlight band, in CSS pixels. Its transparent edges sit fully outside the text at both ends. */
export const ACTIVITY_SWEEP_BAND_PX = 40;
/** Minimum rest between sweeps, so a long sweep never fills the whole cycle. */
export const ACTIVITY_SWEEP_MIN_REST_SEC = 2;
/** Base cycle length; a sweep happens once per cycle. */
export const ACTIVITY_SWEEP_BASE_PERIOD_SEC = 10;

export interface ActivitySweepTiming {
  /** Full loop length in seconds (at least the base period). */
  periodSec: number;
  /** Fraction of the loop, 0..1, at which the sweep finishes. */
  sweepEndRatio: number;
}

/**
 * The band travels from fully left of the text to fully right of it: distance = text width + band width.
 * Duration = distance / speed, so a longer text takes proportionally longer at the same speed.
 */
export function getActivitySweepTiming(textWidthPx: number): ActivitySweepTiming | null {
  if (!Number.isFinite(textWidthPx) || textWidthPx <= 0) return null;
  const sweepSec = (textWidthPx + ACTIVITY_SWEEP_BAND_PX) / ACTIVITY_SWEEP_SPEED_PX_PER_SEC;
  const periodSec = Math.max(ACTIVITY_SWEEP_BASE_PERIOD_SEC, sweepSec + ACTIVITY_SWEEP_MIN_REST_SEC);
  return { periodSec, sweepEndRatio: sweepSec / periodSec };
}
