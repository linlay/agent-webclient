import {
  SWIPE_PROJECTION_DECELERATION,
  advanceSwipeSpring,
  bandSwipeProgress,
  hasHorizontalIntent,
  projectSwipeOffset,
  resolveSwipeOpen,
  resolveSwipeSide,
  rubberBand,
  stepSwipeSpring,
  swipeOpenDirection,
  swipeVelocity,
} from "./mobileSwipeGesture";

describe("swipe intent", () => {
  it("waits for a deliberate horizontal travel", () => {
    expect(hasHorizontalIntent(9, 0)).toBe(false);
    expect(hasHorizontalIntent(10, 0)).toBe(true);
    expect(hasHorizontalIntent(10, 9)).toBe(false);
    expect(hasHorizontalIntent(-40, 5)).toBe(true);
  });

  it("maps the swipe direction to the drawer it opens", () => {
    expect(resolveSwipeSide(40, 4)).toBe("left");
    expect(resolveSwipeSide(-40, 4)).toBe("right");
    expect(resolveSwipeSide(4, 40)).toBeNull();
    expect(resolveSwipeSide(4, 0)).toBeNull();
  });

  it("grows leftward and rightward openness in opposite directions", () => {
    expect(swipeOpenDirection("left")).toBe(1);
    expect(swipeOpenDirection("right")).toBe(-1);
  });
});

describe("momentum projection", () => {
  it("rests where the exponential deceleration predicts", () => {
    expect(projectSwipeOffset(120, 0)).toBe(120);
    const projected = projectSwipeOffset(120, 1000);
    expect(projected).toBeCloseTo(
      120 +
        (1000 / 1000) *
          SWIPE_PROJECTION_DECELERATION /
          (1 - SWIPE_PROJECTION_DECELERATION),
      6,
    );
    expect(projectSwipeOffset(120, -400)).toBeLessThan(120);
  });

  it("commits on position when slow, and on velocity when flicked", () => {
    expect(resolveSwipeOpen(240, 0, 400)).toBe(true);
    expect(resolveSwipeOpen(160, 0, 400)).toBe(false);
    // A short, fast flick still flings the drawer open.
    expect(resolveSwipeOpen(120, 900, 400)).toBe(true);
    // And the reverse closes it before the halfway point.
    expect(resolveSwipeOpen(320, -900, 400)).toBe(false);
    expect(resolveSwipeOpen(0, 0, 0)).toBe(false);
  });
});

describe("bounds", () => {
  it("never rests below closed and resists past fully open", () => {
    expect(bandSwipeProgress(-30, 320)).toBe(0);
    expect(bandSwipeProgress(120, 320)).toBe(120);
    const pulled = bandSwipeProgress(420, 320);
    expect(pulled).toBeGreaterThan(320);
    expect(pulled).toBeLessThan(420);
    expect(bandSwipeProgress(420, 0)).toBe(0);
  });

  it("damps larger overshoots more", () => {
    expect(rubberBand(0, 320)).toBe(0);
    expect(rubberBand(10, 320)).toBeGreaterThan(0);
    expect(rubberBand(10, 320)).toBeLessThan(10);
    expect(rubberBand(100, 320)).toBeLessThan(rubberBand(10, 320) * 10);
  });
});

describe("release velocity", () => {
  it("measures only the trailing window of the gesture", () => {
    expect(swipeVelocity([{ t: 0, x: 0 }], 0)).toBe(0);
    const velocity = swipeVelocity(
      [
        { t: 0, x: 0 },
        { t: 50, x: 100 },
        { t: 100, x: 200 },
      ],
      100,
    );
    expect(velocity).toBeCloseTo(2000, 5);
  });

  it("ignores samples that stopped moving", () => {
    expect(
      swipeVelocity(
        [
          { t: 0, x: 0 },
          { t: 10, x: 50 },
        ],
        500,
      ),
    ).toBe(0);
  });
});

describe("spring settle", () => {
  it("converges without overshooting", () => {
    let state = { position: 0, velocity: 0 };
    let max = 0;
    for (let index = 0; index < 120; index += 1) {
      state = advanceSwipeSpring(state, 100, 1 / 60);
      max = Math.max(max, state.position);
      expect(Number.isFinite(state.position)).toBe(true);
    }
    expect(Math.abs(state.position - 100)).toBeLessThan(1);
    expect(Math.abs(state.velocity)).toBeLessThan(5);
    expect(max).toBeLessThan(100);
  });

  it("carries release velocity through the handoff", () => {
    const withMomentum = advanceSwipeSpring(
      { position: 100, velocity: 800 },
      320,
      0.05,
    );
    const fromRest = advanceSwipeSpring(
      { position: 100, velocity: 0 },
      320,
      0.05,
    );
    expect(withMomentum.position).toBeGreaterThan(fromRest.position);
  });

  it("integrates large frames in fixed substeps", () => {
    let expected = { position: 0, velocity: 0 };
    for (let index = 0; index < 6; index += 1) {
      expected = stepSwipeSpring(
        expected.position,
        expected.velocity,
        200,
        1 / 120,
      );
    }
    const actual = advanceSwipeSpring({ position: 0, velocity: 0 }, 200, 0.05);
    expect(Math.abs(actual.position - expected.position)).toBeLessThan(1e-9);
    expect(Math.abs(actual.velocity - expected.velocity)).toBeLessThan(1e-9);
  });

  it("clamps non-finite frame times", () => {
    const state = advanceSwipeSpring({ position: 0, velocity: 0 }, 100, 5);
    expect(state.position).toBeLessThanOrEqual(100.0001);
  });
});
