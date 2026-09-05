import type { AutomationSummaryResponse } from "@/shared/data";

export interface AutomationsState {
  automations: AutomationSummaryResponse[];
}

export type AutomationsAction = { type: "SET_AUTOMATIONS"; automations: AutomationSummaryResponse[] };
export function createInitialAutomationsState(): AutomationsState { return { automations: [] }; }
export function reduceAutomationsState(_state: AutomationsState, action: AutomationsAction): AutomationsState { return { automations: action.automations }; }
