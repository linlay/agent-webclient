import type { AIUsageSnapshotEvent } from "@/shared/contracts/agentEvents";

export interface UsageState {
  usageSnapshot: AIUsageSnapshotEvent | null;
  usagePopoverOpen: boolean;
}

export type UsageAction =
  | { type: "SET_USAGE_SNAPSHOT"; snapshot: AIUsageSnapshotEvent | null }
  | { type: "SET_USAGE_POPOVER_OPEN"; open: boolean };
export function createInitialUsageState(): UsageState { return { usageSnapshot: null, usagePopoverOpen: false }; }
export function reduceUsageState(state: UsageState, action: UsageAction): UsageState {
  return action.type === "SET_USAGE_SNAPSHOT" ? { ...state, usageSnapshot: action.snapshot } : { ...state, usagePopoverOpen: action.open };
}
