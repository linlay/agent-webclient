import type { AutomationSummaryResponse } from "@/shared/data";

export interface AutomationsState {
  automations: AutomationSummaryResponse[];
}

export type AutomationsAction = { type: "SET_AUTOMATIONS"; automations: AutomationSummaryResponse[] };
export function createInitialAutomationsState(): AutomationsState { return { automations: [] }; }
export function reduceAutomationsState<S extends AutomationsState>(state: S, action: AutomationsAction): S;
export function reduceAutomationsState<S extends AutomationsState>(state: S, action: { type: string }): S | null;
export function reduceAutomationsState<S extends AutomationsState>(state: S, input: { type: string }): S | null {
  const action = input as AutomationsAction;
  switch (action.type) {
    case "SET_AUTOMATIONS":
      return { ...state, automations: action.automations };
    default: return null;
  }
}
