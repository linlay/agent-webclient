import { AGENT_IDLE_MOTIONS, AGENT_WORK_MOTIONS, chooseAgentIdleMotion, chooseAgentMotion } from "./agentMotion";

it("keeps the four idle and four independent work actions disjoint", () => {
  expect(AGENT_IDLE_MOTIONS).toEqual(["turn", "look", "doze", "stretch"]);
  expect(AGENT_WORK_MOTIONS).toEqual(["focus", "compare", "hop", "idea"]);
  expect(AGENT_WORK_MOTIONS.some(motion => (AGENT_IDLE_MOTIONS as readonly string[]).includes(motion))).toBe(false);
});
it("includes dozing immediately like other idle actions and never immediately repeats", () => {
  for (let sample = 0; sample < 100; sample++) {
    const random = () => sample / 100;
    expect(chooseAgentIdleMotion("look", random)).not.toBe("look");
    expect(chooseAgentMotion(AGENT_WORK_MOTIONS, "focus", random)).not.toBe("focus");
  }
  expect(chooseAgentIdleMotion(undefined, () => .5)).toBe("doze");
});
