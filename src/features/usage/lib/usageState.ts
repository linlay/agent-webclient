import type { AIUsageSnapshotEvent } from "@/shared/contracts/agentEvents";

export interface UsageState {
  usageSnapshot: AIUsageSnapshotEvent | null;
  usagePopoverOpen: boolean;
}

export type UsageAction =
  | { type: "SET_USAGE_SNAPSHOT"; snapshot: AIUsageSnapshotEvent | null }
  | { type: "SET_USAGE_POPOVER_OPEN"; open: boolean };
export function createInitialUsageState(): UsageState { return { usageSnapshot: null, usagePopoverOpen: false }; }
export function reduceUsageState<S extends UsageState>(state: S, action: UsageAction): S;
export function reduceUsageState<S extends UsageState>(state: S, action: { type: string }): S | null;
export function reduceUsageState<S extends UsageState>(state: S, input: { type: string }): S | null {
  const action = input as UsageAction;
  switch (action.type) {
    case "SET_USAGE_SNAPSHOT":
      return { ...state, usageSnapshot: action.snapshot };
    case "SET_USAGE_POPOVER_OPEN":
      return { ...state, usagePopoverOpen: action.open };
    default: return null;
  }
}
