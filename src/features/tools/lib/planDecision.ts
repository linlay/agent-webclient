import type { AIAwaitPlanDecision } from "@/app/state/types";

export function isPlanDecision(value: unknown): value is AIAwaitPlanDecision {
  return value === "approve" || value === "reject";
}

function readPlanDecision(value: unknown): AIAwaitPlanDecision | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const decision = (value as Record<string, unknown>).decision;
  return isPlanDecision(decision) ? decision : undefined;
}

export function readPlanSubmitDecision(
  params: unknown,
): AIAwaitPlanDecision | undefined {
  return Array.isArray(params) ? readPlanDecision(params[0]) : undefined;
}

export function readPlanAnswerDecision(
  event: unknown,
): AIAwaitPlanDecision | undefined {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return undefined;
  }
  return readPlanDecision((event as Record<string, unknown>).plan);
}

export function getPlanningModeForPlanDecision(
  decision: AIAwaitPlanDecision,
): boolean {
  return decision === "reject";
}
