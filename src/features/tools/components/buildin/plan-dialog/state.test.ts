import {
  buildPlanSubmitParam,
  resolvePlanOptions,
} from "@/features/tools/components/buildin/plan-dialog/state";

describe("plan dialog state helpers", () => {
  it("falls back to approve and reject options when plan options are missing", () => {
    expect(resolvePlanOptions({ options: undefined })).toEqual([
      {
        label: "Yes, implement this plan",
        decision: "approve",
        input: undefined,
      },
      {
        label: "No, request changes",
        decision: "reject",
        input: {
          type: "text",
          placeholder: "Describe the requested changes",
          required: false,
        },
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
