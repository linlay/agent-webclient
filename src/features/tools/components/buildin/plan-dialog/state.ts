import type {
  AIAwaitPlan,
  AIAwaitPlanDecision,
  AIAwaitPlanOption,
  AIAwaitPlanSubmitParamData,
} from "@/app/state/types";

const DEFAULT_PLAN_OPTIONS: AIAwaitPlanOption[] = [
  {
    label: "Yes, implement this plan",
    decision: "approve",
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
];

export function resolvePlanOptions(
  plan: Pick<AIAwaitPlan, "options">,
): AIAwaitPlanOption[] {
  const normalized = Array.isArray(plan.options)
    ? plan.options.filter(
        (option): option is AIAwaitPlanOption =>
          Boolean(option?.label)
          && (option?.decision === "approve" || option?.decision === "reject"),
      )
    : [];
  return (normalized.length > 0 ? normalized : DEFAULT_PLAN_OPTIONS).map(
    (option) => ({
      ...option,
      input: option.input ? { ...option.input } : undefined,
    }),
  );
}

export function buildPlanSubmitParam(
  plan: AIAwaitPlan,
  decision: AIAwaitPlanDecision,
  reason = "",
): AIAwaitPlanSubmitParamData {
  const trimmedReason = reason.trim();
  return {
    id: plan.id || "confirm",
    decision,
    ...(plan.planningId ? { planningId: plan.planningId } : {}),
    ...(decision === "reject" && trimmedReason ? { reason: trimmedReason } : {}),
  };
}
