import type {
  AIAwaitApproval,
  AIAwaitApprovalDecision,
  AIAwaitApprovalOption,
  AIAwaitApprovalSubmitParamData,
} from "@/app/state/types";

export type ApprovalDialogDecision =
  | AIAwaitApprovalDecision
  | "reject_with_reason";

const DEFAULT_APPROVAL_OPTIONS: AIAwaitApprovalOption[] = [
  {
    label: "同意",
    decision: "approve",
    description: "允许执行当前命令",
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
  decisions: Record<string, ApprovalDialogDecision | undefined>,
  reasons: Record<string, string>,
): AIAwaitApprovalSubmitParamData[] {
  return approvals.map((approval) => ({
    id: approval.id,
    decision: normalizeApprovalDecision(decisions[approval.id]),
    ...(approval.allowFreeText && reasons[approval.id]?.trim()
      ? { reason: reasons[approval.id].trim() }
      : {}),
  }));
}

export function buildPartialApprovalSubmitParams(
  approvals: AIAwaitApproval[],
  decisions: Record<string, ApprovalDialogDecision | undefined>,
  reasons: Record<string, string>,
): AIAwaitApprovalSubmitParamData[] {
  return approvals.flatMap((approval) => {
    const decision = decisions[approval.id];
    if (!decision) {
      return [];
    }
    return [
      {
        id: approval.id,
        decision: normalizeApprovalDecision(decision),
        ...(approval.allowFreeText && reasons[approval.id]?.trim()
          ? { reason: reasons[approval.id].trim() }
          : {}),
      },
    ];
  });
}

function normalizeApprovalDecision(
  decision: ApprovalDialogDecision | undefined,
): AIAwaitApprovalDecision {
  return decision === "reject_with_reason" ? "reject" : decision as AIAwaitApprovalDecision;
}
