import type { QueryReasoningEffort } from "@/shared/data/api/client";

export const QUERY_REASONING_EFFORTS: readonly QueryReasoningEffort[] = [
  "NONE",
  "LOW",
  "MEDIUM",
  "HIGH",
  "XHIGH",
  "MAX",
];

export const ACTIVE_QUERY_REASONING_EFFORTS: readonly QueryReasoningEffort[] =
  QUERY_REASONING_EFFORTS.filter((effort) => effort !== "NONE");

export function normalizeQueryReasoningEffort(
  value: unknown,
): QueryReasoningEffort | undefined {
  const effort = String(value ?? "").trim().toUpperCase();
  if (effort === "EXTRA_HIGH") return "XHIGH";
  return QUERY_REASONING_EFFORTS.includes(effort as QueryReasoningEffort)
    ? (effort as QueryReasoningEffort)
    : undefined;
}
