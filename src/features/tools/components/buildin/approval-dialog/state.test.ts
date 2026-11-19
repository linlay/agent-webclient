import {
  buildPartialApprovalSubmitParams,
  buildApprovalSubmitParams,
  presentApprovalReasons,
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
        { decision: "reject" },
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
      {
        decision: "reject",
        label: "Reject",
        description: undefined,
      },
    ]);
  });

  it("uses local labels instead of backend labels for known decisions", () => {
    expect(resolveApprovalOptions({
      options: [
        {
          decision: "approve",
          label: "同意",
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

  it("shows only pending policy leaves in the details", () => {
    const approval = {
      id: "bash",
      command: "find . -type f -print0 | xargs -0 du -k",
      ruleKey: "xargs-rule",
      options: [{ decision: "approve" as const }, { decision: "approve_rule_run" as const }],
      policy: {
        reason: "duplicate aggregate",
        requirements: [
          {
            decision: "requires_approval",
            ruleKey: "xargs-rule",
            reasonCode: "runtime_wrapper_arguments",
            subject: "xargs",
          },
          {
            decision: "requires_approval",
            requirements: [
              { reasonCode: "path_outside_read_roots", subject: "/usr/bin/xargs" },
              { reasonCode: "execution_effects_unknown", subject: "/usr/bin/xargs" },
              { decision: "auto_approved", reason: "already allowed" },
            ],
          },
        ],
      },
      requirements: [{ ruleKey: "xargs-rule", reason: "duplicate aggregate" }],
    };
    const translate = (key: string, params?: Record<string, unknown>) =>
      [key, params?.subject].filter(Boolean).join(" ");
    expect(presentApprovalReasons(approval, translate).map((item) => item.detail)).toEqual([
      "approvalDialog.reason.runtimeArguments.detail xargs",
      "approvalDialog.reason.readPath.detail /usr/bin/xargs",
      "approvalDialog.reason.executionEffects.detail /usr/bin/xargs",
    ]);
  });

  it("shows the resolved executable for an invocation-bound approval", () => {
    const reasons = presentApprovalReasons({
      id: "bash", command: "wecom-cli --version",
      policy: {
        reasonCode: "execution_effects_unknown", subject: "wecom-cli",
        scopeKind: "invocation_version", scope: "/opt/other/bin/wecom-cli",
      },
    }, (key, params) => `${key} ${params?.subject ?? ""}`);
    expect(reasons[0].detail).toBe("approvalDialog.reason.executionEffects.versioned /opt/other/bin/wecom-cli");
  });

  it("uses legacy text for single policy nodes or per-file requirements", () => {
    const approval = { id: "tool", command: "check" };
    expect(presentApprovalReasons({
      ...approval,
      policy: { reason: "older policy summary" },
    }, t)).toMatchObject([{ detail: "older policy summary" }]);
    expect(presentApprovalReasons({
      ...approval,
      requirements: [
        { reasonCode: "future", reason: "file outside roots", path: "/a" },
        { reason: "file outside roots", path: "/b" },
      ],
    }, t).map((item) => item.detail)).toEqual([
      "file outside roots · /a",
      "file outside roots · /b",
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
