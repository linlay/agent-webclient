import type { AgentEvent } from "@/shared/contracts/agentEvents";

export interface DebugState {
  debugEvents: AgentEvent[];
  debugLines: string[];
}

export type DebugAction =
  | { type: "APPEND_DEBUG"; line: string }
  | { type: "CLEAR_DEBUG" };
export function createInitialDebugState(): DebugState { return { debugEvents: [], debugLines: [] }; }
