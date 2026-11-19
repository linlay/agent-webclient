import type { AIAwaitApproval, AIAwaitApprovalDecision, AIAwaitApprovalOption, AIAwaitApprovalRequirement, AIAwaitApprovalSubmitParamData } from "@/shared/contracts/agentEvents";
import type { TranslateParams } from "@/shared/i18n";

export type ApprovalDialogDecision =
  | AIAwaitApprovalDecision
  | "reject_with_reason";

export interface ApprovalDialogOption {
  decision: AIAwaitApprovalDecision;
  label: string;
  description?: string;
}

type ApprovalDialogTranslate = (
  key: string,
  params?: TranslateParams,
) => string;

const DEFAULT_APPROVAL_DECISIONS: AIAwaitApprovalDecision[] = ["approve"];

export function resolveApprovalOptions(
  approval: Pick<AIAwaitApproval, "options">,
  t: ApprovalDialogTranslate,
): ApprovalDialogOption[] {
  const normalized = Array.isArray(approval.options)
    ? approval.options.filter(
        (option): option is AIAwaitApprovalOption =>
          isApprovalDecision(option?.decision),
      )
    : [];
  const options = normalized.length > 0
    ? normalized
    : DEFAULT_APPROVAL_DECISIONS.map((decision) => ({ decision }));

  return options.map((option) => ({
    decision: option.decision,
    label: approvalDecisionLabel(option.decision, t),
    description: approvalDecisionDescription(option.decision, t),
  }));
}

function pendingApprovalLeaves(item: AIAwaitApprovalRequirement): AIAwaitApprovalRequirement[] {
  if (item.decision && item.decision !== "requires_approval") return [];
  if (item.requirements?.length) return item.requirements.flatMap(pendingApprovalLeaves);
  return item.reason || item.reasonCode ? [item] : [];
}

function localizedApprovalReason(item: AIAwaitApprovalRequirement, t: ApprovalDialogTranslate) {
  const subject = item.subject || item.path || item.scope;
  if (!subject) return;
  switch (item.reasonCode) {
    case "runtime_wrapper_arguments":
      return {
        title: t("approvalDialog.reason.runtimeArguments", { subject }),
        detail: t("approvalDialog.reason.runtimeArguments.detail", { subject }),
      };
    case "path_outside_read_roots":
      return {
        title: t("approvalDialog.reason.readPath"),
        detail: t("approvalDialog.reason.readPath.detail", { subject }),
      };
    case "path_outside_write_roots":
      return {
        title: t("approvalDialog.reason.writePath"),
        detail: t("approvalDialog.reason.writePath.detail", { subject }),
      };
    case "execution_effects_unknown":
      return {
        title: t("approvalDialog.reason.executionEffects"),
        detail: t(item.scopeKind === "invocation_version"
          ? "approvalDialog.reason.executionEffects.versioned"
          : "approvalDialog.reason.executionEffects.detail", { subject }),
      };
  }
}

export function presentApprovalReasons(approval: AIAwaitApproval, t: ApprovalDialogTranslate) {
  const policyLeaves = approval.policy ? pendingApprovalLeaves(approval.policy) : [];
  const leaves = approval.policy?.requirements?.length || policyLeaves.length
    ? policyLeaves
    : (approval.requirements ?? []).flatMap(pendingApprovalLeaves);

  return leaves.flatMap((item) => {
    const localized = localizedApprovalReason(item, t);
    if (!localized && !item.reason) return [];
    const subject = item.subject || item.path;
    return [{
      title: localized?.title,
      detail: localized?.detail ?? [item.reason, subject && !item.reason?.includes(subject) ? subject : undefined]
        .filter(Boolean).join(" · "),
    }];
  });
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

export function findApprovalDecisionError(
  approvals: AIAwaitApproval[],
  decisions: Record<string, ApprovalDialogDecision | undefined>,
  reasons: Record<string, string>,
  t: ApprovalDialogTranslate,
): { index: number; message: string } | null {
  const normalizedApprovals = Array.isArray(approvals) ? approvals : [];
  for (let index = 0; index < normalizedApprovals.length; index += 1) {
    const approval = normalizedApprovals[index];
    const decision = decisions[approval.id];
    if (!decision) {
      return {
        index,
        message: t("approvalDialog.error.missingDecision"),
      };
    }
    if (decision === "reject_with_reason" && !reasons[approval.id]?.trim()) {
      return {
        index,
        message: t("approvalDialog.error.missingReason"),
      };
    }
  }
  return null;
}

function normalizeApprovalDecision(
  decision: ApprovalDialogDecision | undefined,
): AIAwaitApprovalDecision {
  return decision === "reject_with_reason"
    ? "reject"
    : decision as AIAwaitApprovalDecision;
}

function isApprovalDecision(
  decision: unknown,
): decision is AIAwaitApprovalDecision {
  return decision === "approve"
    || decision === "approve_rule_run"
    || decision === "reject";
}

function approvalDecisionLabel(
  decision: AIAwaitApprovalDecision,
  t: ApprovalDialogTranslate,
): string {
  switch (decision) {
    case "approve_rule_run":
      return t("approvalDialog.option.approveRuleRun");
    case "reject":
      return t("approvalDialog.option.reject");
    case "approve":
    default:
      return t("approvalDialog.option.approve");
  }
}

function approvalDecisionDescription(
  decision: AIAwaitApprovalDecision,
  t: ApprovalDialogTranslate,
): string | undefined {
  switch (decision) {
    case "approve_rule_run":
      return t("approvalDialog.option.approveRuleRun.description");
    case "approve":
      return t("approvalDialog.option.approve.description");
    case "reject":
    default:
      return undefined;
  }
}
