import type { AgentEvent } from "@/shared/contracts/agentEvents";

export interface DebugState {
  debugEvents: AgentEvent[];
  debugLines: string[];
}

export type DebugAction =
  | { type: "APPEND_DEBUG"; line: string }
  | { type: "CLEAR_DEBUG" };
export function createInitialDebugState(): DebugState { return { debugEvents: [], debugLines: [] }; }
export function reduceDebugState(state: DebugState, action: DebugAction): DebugState {
  return action.type === "APPEND_DEBUG" ? { ...state, debugLines: [...state.debugLines, action.line] } : { ...state, debugEvents: [], debugLines: [] };
}
