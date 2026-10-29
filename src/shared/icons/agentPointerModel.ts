import type { AgentIconName } from "./agentAppearance";

export type PointerAgentName = AgentIconName;
export type AgentPointerMood = "rest" | "follow" | "round" | "wink" | "think" | "read" | "side";
export const POINTER_AGENT_PROFILES = {
  general: { range: 1.7, lag: .17, head: 8 },
  coder: { range: 1.2, lag: .18, head: 1 },
  kbase: { range: 1.4, lag: .12, head: 3 },
  team: { range: .6, lag: .12, head: .25 },
  proxy: { range: 1.5, lag: .15, head: 3 },
  executor: { range: 1.4, lag: .15, head: 3 },
} as const;
export function supportsAgentPointer(name: AgentIconName): name is PointerAgentName {
  return Object.hasOwn(POINTER_AGENT_PROFILES, name);
}
export function agentPointerTarget(input: {
  name: PointerAgentName; dx: number; dy: number; width: number;
  active: boolean; stationaryMs: number; greeting: boolean; focused: boolean;
}) {
  const { name, dx, dy, width, active, stationaryMs, greeting, focused } = input;
  const profile = POINTER_AGENT_PROFILES[name];
  const small = width <= 48;
  let mood: AgentPointerMood = "rest";
  if (active) {
    if (greeting) mood = "wink";
    else if (Math.hypot(dx, dy) < width * .72) mood = "round";
    else if (focused || stationaryMs > 1050 || (dy < -width * .45 && Math.abs(dx) < 132)) mood = "think";
    else if (dy > width * .55 && Math.abs(dx) < 132) mood = "read";
    else if (Math.abs(dx) > width * .6) mood = "side";
    else mood = "follow";
  }
  return {
    mood,
    x: active ? (focused ? 0 : Math.tanh(dx / 140) * 13 * profile.range) : 0,
    y: active ? (focused ? -3 : Math.tanh(dy / 125) * 9 * profile.range) : 0,
    angle: active ? Math.max(-1, Math.min(1, dx / 120)) * profile.head * (small ? .6 : 1) : 0,
    lift: active ? (name === "team" ? 0 : 2) : 0,
  };
}
