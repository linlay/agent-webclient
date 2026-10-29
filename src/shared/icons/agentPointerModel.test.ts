import { agentPointerTarget, supportsAgentPointer, POINTER_AGENT_PROFILES } from "./agentPointerModel";
const input = { name: "general" as const, dx: 80, dy: 0, width: 40, active: true, stationaryMs: 0, greeting: false, focused: false };

it("supports all six built-in resting characters", () => {
  expect(["general", "coder", "kbase", "team", "proxy", "executor"].every(name => supportsAgentPointer(name as any))).toBe(true);
  expect(supportsAgentPointer("proxy")).toBe(true);
  expect(supportsAgentPointer("executor")).toBe(true);
});
it("caps extreme pointer positions with consistent head motion across sizes", () => {
  const small = agentPointerTarget({ ...input, dx: 100_000, dy: -100_000 });
  const large = agentPointerTarget({ ...input, width: 146, dx: 100_000, dy: -100_000 });
  expect(small.x).toBeLessThanOrEqual(13 * POINTER_AGENT_PROFILES.general.range);
  expect(Math.abs(small.y)).toBeLessThanOrEqual(9 * POINTER_AGENT_PROFILES.general.range);
  expect(small).toEqual(large);
});
it("chooses distinct near, greeting, stationary, downward and side reactions", () => {
  expect(agentPointerTarget({ ...input, dx: 0 }).mood).toBe("round");
  expect(agentPointerTarget({ ...input, greeting: true }).mood).toBe("wink");
  expect(agentPointerTarget({ ...input, stationaryMs: 1200 }).mood).toBe("think");
  expect(agentPointerTarget({ ...input, dx: 0, dy: 60 }).mood).toBe("read");
  expect(agentPointerTarget(input).mood).toBe("side");
  expect(agentPointerTarget({ ...input, active: false })).toEqual({ mood: "rest", x: 0, y: 0, angle: 0, lift: 0 });
});

it.each(["general", "coder", "kbase", "team", "proxy", "executor"] as const)("keeps %s eye shapes, gaze and tilt identical at equivalent positions in 22/40/80px avatars", name => {
  for (const [dx, dy] of [[12, 8], [-18, -15], [50, 25], [0, 30], [0, -30]]) {
    const expected = agentPointerTarget({ ...input, name, dx, dy });
    for (const width of [22, 40, 80]) {
      const actual = agentPointerTarget({ ...input, name, width, dx: dx * width / 40, dy: dy * width / 40 });
      expect(actual.mood).toBe(expected.mood);
      for (const key of ["x", "y", "angle", "lift"] as const) expect(actual[key]).toBeCloseTo(expected[key], 12);
    }
  }
});
