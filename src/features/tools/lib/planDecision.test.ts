import {
  getPlanningModeForPlanDecision,
  readPlanAnswerDecision,
  readPlanSubmitDecision,
} from "@/features/tools/lib/planDecision";

describe("plan decision helpers", () => {
  it("reads approve and reject decisions from plan submit params", () => {
    expect(readPlanSubmitDecision([{ decision: "approve" }])).toBe("approve");
    expect(readPlanSubmitDecision([{ decision: "reject" }])).toBe("reject");
  });

  it("ignores empty or malformed submit params", () => {
    expect(readPlanSubmitDecision([])).toBeUndefined();
    expect(readPlanSubmitDecision([{ decision: "approve_rule_run" }])).toBeUndefined();
    expect(readPlanSubmitDecision([{ decision: "" }])).toBeUndefined();
    expect(readPlanSubmitDecision({ decision: "approve" })).toBeUndefined();
  });

  it("reads approve and reject decisions from awaiting answer events", () => {
    expect(readPlanAnswerDecision({ plan: { decision: "approve" } })).toBe("approve");
    expect(readPlanAnswerDecision({ plan: { decision: "reject" } })).toBe("reject");
  });

  it("maps plan decisions to planning mode state", () => {
    expect(getPlanningModeForPlanDecision("approve")).toBe(false);
    expect(getPlanningModeForPlanDecision("reject")).toBe(true);
  });
});
