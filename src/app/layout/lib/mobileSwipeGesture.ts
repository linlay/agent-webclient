/**
 * Pure gesture math for the `/mobile` swipe drawers. The DOM wiring lives in
 * `hooks/useMobileSwipeGestures.ts`; keeping thresholds, momentum projection and
 * the spring integrator here makes the feel of the drawers testable without a
 * layout engine.
 */

/** Finger travel before a swipe claims the gesture (hysteresis, not a delay). */
export const SWIPE_INTENT_DISTANCE = 10;

/** A horizontal swipe must be this much wider than its vertical travel. */
export const SWIPE_DIRECTION_RATIO = 1.2;

/** Width of the screen edge that counts as an intentional swipe start. */
export const SWIPE_EDGE_ZONE = 24;

/**
 * Scroll deceleration Apple uses to project where a release would rest. This is
 * the exponential-decay form from "Designing Fluid Interfaces", not v²/2a.
 */
export const SWIPE_PROJECTION_DECELERATION = 0.998;

/** Release position, as a share of panel width, that switches the panel state. */
export const SWIPE_SETTLE_RATIO = 0.5;

/** Samples older than this no longer contribute to the release velocity. */
export const SWIPE_VELOCITY_WINDOW_MS = 100;

/** Drawer spring: slightly quicker than Apple's default sheet response. */
export const SWIPE_SPRING_RESPONSE = 0.32;

/** Critically damped so a drawer never reveals a gap past its resting edge. */
export const SWIPE_SPRING_DAMPING = 1;

export type SwipeSide = "left" | "right";

/** True once the pointer has travelled far enough, mostly horizontally. */
export function hasHorizontalIntent(dx: number, dy: number): boolean {
  return (
    Math.abs(dx) >= SWIPE_INTENT_DISTANCE &&
    Math.abs(dx) > Math.abs(dy) * SWIPE_DIRECTION_RATIO
  );
}

/** A new swipe opens the drawer on the side it moves toward. */
export function resolveSwipeSide(dx: number, dy: number): SwipeSide | null {
  if (!hasHorizontalIntent(dx, dy)) return null;
  return dx > 0 ? "left" : "right";
}

/** Projected resting offset (px) for a release at `offset` with `velocity` px/s. */
export function projectSwipeOffset(offset: number, velocity: number): number {
  const deceleration = SWIPE_PROJECTION_DECELERATION;
  return offset + (velocity / 1000) * deceleration / (1 - deceleration);
}

/** Decide the committed state from the release point plus projected momentum. */
export function resolveSwipeOpen(
  offset: number,
  velocity: number,
  width: number,
): boolean {
  if (width <= 0) return false;
  return projectSwipeOffset(offset, velocity) >= width * SWIPE_SETTLE_RATIO;
}

/** Progressive resistance past a boundary. */
export function rubberBand(
  overshoot: number,
  dimension: number,
  constant = 0.55,
): number {
  if (overshoot <= 0 || dimension <= 0) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/**
 * Keep an interactive drawer offset inside its range. The open side gets a
 * soft stop so pulling past fully-open responds instead of freezing.
 */
export function bandSwipeProgress(offset: number, width: number): number {
  if (width <= 0) return 0;
  if (offset <= 0) return 0;
  if (offset <= width) return offset;
  return width + rubberBand(offset - width, width);
}

/** Finger velocity in px/s over the trailing window of samples. */
export function swipeVelocity(
  samples: ReadonlyArray<{ t: number; x: number }>,
  now: number,
): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  if (!last || now - last.t > SWIPE_VELOCITY_WINDOW_MS * 2) return 0;
  let firstIndex = samples.length - 1;
  while (
    firstIndex > 0 &&
    last.t - samples[firstIndex - 1].t <= SWIPE_VELOCITY_WINDOW_MS
  ) {
    firstIndex -= 1;
  }
  const first = samples[firstIndex];
  const elapsed = last.t - first.t;
  if (!first || elapsed <= 0) return 0;
  return ((last.x - first.x) / elapsed) * 1000;
}

export interface SwipeSpringState {
  position: number;
  velocity: number;
}

/**
 * One analytically-parameterised spring step. `response` is the time constant in
 * seconds, `damping` 1 is critically damped. The caller hands off the release
 * velocity so drag and settle never seam.
 */
export function stepSwipeSpring(
  position: number,
  velocity: number,
  target: number,
  dt: number,
  response = SWIPE_SPRING_RESPONSE,
  damping = SWIPE_SPRING_DAMPING,
): SwipeSpringState {
  const omega = (2 * Math.PI) / response;
  const acceleration =
    -omega * omega * (position - target) - 2 * damping * omega * velocity;
  const nextVelocity = velocity + acceleration * dt;
  return {
    position: position + nextVelocity * dt,
    velocity: nextVelocity,
  };
}

/** Fixed 1/120s substeps keep the spring stable on slow frames. */
export function advanceSwipeSpring(
  state: SwipeSpringState,
  target: number,
  elapsedSeconds: number,
  response = SWIPE_SPRING_RESPONSE,
  damping = SWIPE_SPRING_DAMPING,
): SwipeSpringState {
  let remaining = Math.max(0, Math.min(elapsedSeconds, 0.05));
  let next = state;
  while (remaining > 0) {
    const step = Math.min(remaining, 1 / 120);
    next = stepSwipeSpring(
      next.position,
      next.velocity,
      target,
      step,
      response,
      damping,
    );
    remaining -= step;
  }
  return next;
}

/** Openness offset per horizontal pixel: left grows rightward, right leftward. */
export function swipeOpenDirection(side: SwipeSide): 1 | -1 {
  return side === "left" ? 1 : -1;
}
