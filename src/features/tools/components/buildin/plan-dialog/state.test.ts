import {
  buildPlanSubmitParam,
  resolvePlanOptions,
} from "@/features/tools/components/buildin/plan-dialog/state";

describe("plan dialog state helpers", () => {
  it("falls back to approve and reject options when plan options are missing", () => {
    expect(resolvePlanOptions({ options: undefined })).toEqual([
      {
        decision: "approve",
        input: undefined,
      },
      {
        decision: "reject",
        input: undefined,
      },
    ]);
  });

  it("accepts decision-only approve and reject options", () => {
    expect(resolvePlanOptions({
      options: [
        { decision: "approve" },
        { decision: "reject" },
      ],
    })).toEqual([
      {
        decision: "approve",
        input: undefined,
      },
      {
        decision: "reject",
        input: undefined,
      },
    ]);
  });

  it("builds approve and reject submit params for a single plan", () => {
    const plan = {
      id: "confirm",
      planningId: "run_1_planning_1",
      title: "实施此计划？",
    };

    expect(buildPlanSubmitParam(plan, "approve")).toEqual({
      id: "confirm",
      planningId: "run_1_planning_1",
      decision: "approve",
    });
    expect(buildPlanSubmitParam(plan, "reject", " 请补充测试范围 ")).toEqual({
      id: "confirm",
      planningId: "run_1_planning_1",
      decision: "reject",
      reason: "请补充测试范围",
    });
    expect(buildPlanSubmitParam(plan, "reject", " ")).toEqual({
      id: "confirm",
      planningId: "run_1_planning_1",
      decision: "reject",
    });
  });
});
