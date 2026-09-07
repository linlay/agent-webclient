import type { UiTimerHandle } from "@/shared/contracts/ui";

export interface PlanItem {
  taskId: string;
  description?: string;
  status?: string;
  [key: string]: unknown;
}

export interface Plan {
  planId: string;
  plan: PlanItem[];
}

export interface PlanRuntime {
  status: string;
  updatedAt: number;
  error: string;
}

export interface PlanState {
  plan: Plan | null;
  planRuntimeByTaskId: Map<string, PlanRuntime>;
  planCurrentRunningTaskId: string;
  planLastTouchedTaskId: string;
  planExpanded: boolean;
  planManualOverride: boolean | null;
  planAutoCollapseTimer: UiTimerHandle | null;
}

export type PlanAction =
  | { type: "SET_PLAN"; plan: Plan | null }
  | { type: "SET_PLAN_EXPANDED"; expanded: boolean }
  | { type: "SET_PLAN_MANUAL_OVERRIDE"; override: boolean | null }
  | { type: "SET_PLAN_RUNTIME"; taskId: string; runtime: PlanRuntime }
  | { type: "SET_PLAN_CURRENT_RUNNING_TASK_ID"; taskId: string }
  | { type: "SET_PLAN_LAST_TOUCHED_TASK_ID"; taskId: string }
  | { type: "SET_PLAN_AUTO_COLLAPSE_TIMER"; timer: UiTimerHandle | null };

export function createInitialPlanState(): PlanState {
  return { plan: null, planRuntimeByTaskId: new Map(), planCurrentRunningTaskId: "", planLastTouchedTaskId: "", planExpanded: false, planManualOverride: null, planAutoCollapseTimer: null };
}

export function reducePlanState(state: PlanState, action: PlanAction): PlanState {
  switch (action.type) {
    case "SET_PLAN": return { ...state, plan: action.plan };
    case "SET_PLAN_EXPANDED": return { ...state, planExpanded: action.expanded };
    case "SET_PLAN_MANUAL_OVERRIDE": return { ...state, planManualOverride: action.override };
    case "SET_PLAN_RUNTIME": return { ...state, planRuntimeByTaskId: new Map(state.planRuntimeByTaskId).set(action.taskId, action.runtime) };
    case "SET_PLAN_CURRENT_RUNNING_TASK_ID": return { ...state, planCurrentRunningTaskId: action.taskId };
    case "SET_PLAN_LAST_TOUCHED_TASK_ID": return { ...state, planLastTouchedTaskId: action.taskId };
    case "SET_PLAN_AUTO_COLLAPSE_TIMER": return { ...state, planAutoCollapseTimer: action.timer };
  }
}
