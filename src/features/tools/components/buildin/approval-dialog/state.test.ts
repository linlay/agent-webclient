import {
  buildApprovalSubmitParams,
  resolveApprovalOptions,
} from "@/features/tools/components/buildin/approval-dialog/state";

describe("approval dialog state helpers", () => {
  it("falls back to default options when approval options are missing", () => {
    expect(resolveApprovalOptions({ options: undefined })).toEqual([
      {
        label: "同意",
        decision: "approve",
        description: "只本次放行这条命令",
      },
      {
        label: "同意（本次运行同前缀都放行）",
        decision: "approve_prefix_run",
        description: "本次 run 内同规则命令自动放行，不再重复询问",
      },
      {
        label: "拒绝",
        decision: "reject",
        description: "终止这条命令",
      },
    ]);
  });

  it("builds ordered submit params with per-item reasons", () => {
    const approvals = [
      {
        id: "tool_1",
        command: "chmod 777 ~/a.sh",
        allowFreeText: true,
      },
      {
        id: "tool_2",
        command: "chmod 777 ~/b.sh",
        allowFreeText: true,
      },
    ];

    expect(buildApprovalSubmitParams(
      approvals,
      {
        tool_1: "approve_prefix_run",
        tool_2: "reject",
      },
      {
        tool_1: "",
        tool_2: "权限风险过高",
      },
    )).toEqual([
      {
        id: "tool_1",
        decision: "approve_prefix_run",
      },
      {
        id: "tool_2",
        decision: "reject",
        reason: "权限风险过高",
      },
    ]);
  });
});
