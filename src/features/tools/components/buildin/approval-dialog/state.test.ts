import {
  buildPartialApprovalSubmitParams,
  buildApprovalSubmitParams,
  resolveApprovalOptions,
} from "@/features/tools/components/buildin/approval-dialog/state";

const terms: Record<string, string> = {
  "approvalDialog.option.approve": "Approve",
  "approvalDialog.option.approve.description": "Allow once",
  "approvalDialog.option.approveRuleRun": "Approve matching requests",
  "approvalDialog.option.approveRuleRun.description": "Allow matching requests in this run",
  "approvalDialog.option.reject": "Reject",
};

const t = (key: string) => terms[key] ?? key;

describe("approval dialog state helpers", () => {
  it("falls back to default options when approval options are missing", () => {
    expect(resolveApprovalOptions({ options: undefined }, t)).toEqual([
      {
        decision: "approve",
        label: "Approve",
        description: "Allow once",
      },
    ]);
  });

  it("localizes decision-only approval options", () => {
    expect(resolveApprovalOptions({
      options: [
        { decision: "approve" },
        { decision: "approve_rule_run" },
      ],
    }, t)).toEqual([
      {
        decision: "approve",
        label: "Approve",
        description: "Allow once",
      },
      {
        decision: "approve_rule_run",
        label: "Approve matching requests",
        description: "Allow matching requests in this run",
      },
    ]);
  });

  it("uses local labels instead of backend labels for known decisions", () => {
    expect(resolveApprovalOptions({
      options: [
        {
          decision: "approve",
          label: "同意",
          description: "旧后端描述",
        },
      ],
    }, t)).toEqual([
      {
        decision: "approve",
        label: "Approve",
        description: "Allow once",
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
        tool_1: "approve_rule_run",
        tool_2: "reject",
      },
      {
        tool_1: "",
        tool_2: "权限风险过高",
      },
    )).toEqual([
      {
        id: "tool_1",
        decision: "approve_rule_run",
      },
      {
        id: "tool_2",
        decision: "reject",
        reason: "权限风险过高",
      },
    ]);
  });

  it("builds partial submit params for timeout auto-submit", () => {
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

    expect(buildPartialApprovalSubmitParams(
      approvals,
      {
        tool_1: "approve",
      },
      {
        tool_1: "已确认",
        tool_2: "不会被带上",
      },
    )).toEqual([
      {
        id: "tool_1",
        decision: "approve",
        reason: "已确认",
      },
    ]);
  });

  it("maps reject_with_reason to reject on submit", () => {
    const approvals = [
      {
        id: "tool_3",
        command: "rm -rf /tmp/demo",
        allowFreeText: true,
      },
    ];

    expect(buildApprovalSubmitParams(
      approvals,
      {
        tool_3: "reject_with_reason",
      },
      {
        tool_3: "请改成工作区内路径",
      },
    )).toEqual([
      {
        id: "tool_3",
        decision: "reject",
        reason: "请改成工作区内路径",
      },
    ]);
  });
});
