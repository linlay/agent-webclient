import { agentPointerTarget, supportsAgentPointer, POINTER_AGENT_PROFILES } from "./agentPointerModel";
const input = { name: "general" as const, dx: 80, dy: 0, width: 40, active: true, stationaryMs: 0, greeting: false, focused: false };

it("supports the four approved resting characters only", () => {
  expect(["general", "coder", "kbase", "team"].every(name => supportsAgentPointer(name as any))).toBe(true);
  expect(supportsAgentPointer("proxy")).toBe(false);
  expect(supportsAgentPointer("executor")).toBe(false);
});
it("caps extreme pointer positions and reduces head motion in sidebar sizes", () => {
  const small = agentPointerTarget({ ...input, dx: 100_000, dy: -100_000 });
  const large = agentPointerTarget({ ...input, width: 146, dx: 100_000, dy: -100_000 });
  expect(small.x).toBeLessThanOrEqual(9 * POINTER_AGENT_PROFILES.general.range);
  expect(Math.abs(small.y)).toBeLessThanOrEqual(6 * POINTER_AGENT_PROFILES.general.range);
  expect(Math.abs(small.angle)).toBeLessThan(Math.abs(large.angle));
});
it("chooses distinct near, greeting, stationary, downward and side reactions", () => {
  expect(agentPointerTarget({ ...input, dx: 0 }).mood).toBe("round");
  expect(agentPointerTarget({ ...input, greeting: true }).mood).toBe("wink");
  expect(agentPointerTarget({ ...input, stationaryMs: 1200 }).mood).toBe("think");
  expect(agentPointerTarget({ ...input, dx: 0, dy: 60 }).mood).toBe("read");
  expect(agentPointerTarget(input).mood).toBe("side");
  expect(agentPointerTarget({ ...input, active: false })).toEqual({ mood: "rest", x: 0, y: 0, angle: 0, lift: 0 });
});
