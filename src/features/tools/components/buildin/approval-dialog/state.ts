import type {
  AIAwaitApproval,
  AIAwaitApprovalDecision,
  AIAwaitApprovalOption,
  AIAwaitApprovalSubmitParamData,
} from "@/app/state/types";

const DEFAULT_APPROVAL_OPTIONS: AIAwaitApprovalOption[] = [
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
];

export function resolveApprovalOptions(
  approval: Pick<AIAwaitApproval, "options">,
): AIAwaitApprovalOption[] {
  const normalized = Array.isArray(approval.options)
    ? approval.options.filter(
        (option): option is AIAwaitApprovalOption =>
          Boolean(option?.label) && Boolean(option?.decision),
      )
    : [];
  return normalized.length > 0
    ? normalized.map((option) => ({ ...option }))
    : DEFAULT_APPROVAL_OPTIONS.map((option) => ({ ...option }));
}

export function buildApprovalSubmitParams(
  approvals: AIAwaitApproval[],
  decisions: Record<string, AIAwaitApprovalDecision | undefined>,
  reasons: Record<string, string>,
): AIAwaitApprovalSubmitParamData[] {
  return approvals.map((approval) => ({
    id: approval.id,
    decision: decisions[approval.id] as AIAwaitApprovalDecision,
    ...(approval.allowFreeText && reasons[approval.id]?.trim()
      ? { reason: reasons[approval.id].trim() }
      : {}),
  }));
}
