import type {
  AIAwaitApproval,
  AIAwaitForm,
  AIAwaitPlan,
  AIAwaitQuestion,
} from "@/shared/contracts/agentEvents";
import { ViewportTypeEnum } from "@/shared/contracts/agentEvents";
import type { RunOwner } from "@/shared/data/runOwner";

export interface ToolState {
  toolId: string;
  argsBuffer: string;
  agentKey: string;
  toolLabel?: string;
  toolName: string;
  toolType: string;
  viewportKey: string;
  toolTimeout: number | null;
  toolParams: Record<string, unknown> | null;
  description: string;
  runId: string;
}

export interface ActionState {
  actionId: string;
  actionName: string;
  argsBuffer: string;
}

export interface PendingTool {
  key: string;
  runId: string;
  toolId: string;
  toolLabel?: string;
  toolName: string;
  viewportKey: string;
  toolType: string;
  description: string;
  payloadText: string;
  status: string;
  statusText?: string;
}

export interface ActiveFrontendTool {
  key: string;
  runId: string;
  agentKey: string;
  owner?: RunOwner;
  toolId: string;
  viewportKey: string;
  toolType: string;
  toolLabel?: string;
  toolName: string;
  description: string;
  toolTimeout: number | null;
  toolParams: Record<string, unknown>;
  loading: boolean;
  loadError: string;
  viewportHtml: string;
}

export type ActiveAwaitingResolutionReason = "timeout" | "remote_answered";

interface ActiveAwaitingBase {
  key: string;
  awaitingId: string;
  runId: string;
  agentKey: string;
  owner?: RunOwner;
  timeout: number | null;
  createdAt?: number | null;
  resolutionReason?: ActiveAwaitingResolutionReason;
  pendingSubmitId?: string;
}

export interface QuestionActiveAwaiting extends ActiveAwaitingBase {
  mode: "question";
  questions: AIAwaitQuestion[];
}

export interface ApprovalActiveAwaiting extends ActiveAwaitingBase {
  mode: "approval";
  approvals: AIAwaitApproval[];
}

export interface FormActiveAwaiting extends ActiveAwaitingBase {
  mode: "form";
  forms: AIAwaitForm[];
  viewportKey: string;
  viewportType: ViewportTypeEnum.Html;
  loading: boolean;
  loadError: string;
  viewportHtml: string;
}

export interface PlanActiveAwaiting extends ActiveAwaitingBase {
  mode: "plan";
  plan: AIAwaitPlan;
}

export type ActiveAwaiting =
  | QuestionActiveAwaiting
  | ApprovalActiveAwaiting
  | FormActiveAwaiting
  | PlanActiveAwaiting;

export interface ToolsState {
  toolStates: Map<string, ToolState>;
  pendingTools: Map<string, PendingTool>;
  actionStates: Map<string, ActionState>;
  executedActionIds: Set<string>;
  activeFrontendTool: ActiveFrontendTool | null;
  activeAwaiting: ActiveAwaiting | null;
  pendingAwaitings: ActiveAwaiting[];
}

export type ToolsAction =
  | { type: "SET_ACTIVE_FRONTEND_TOOL"; tool: ActiveFrontendTool | null }
  | { type: "SET_ACTIVE_AWAITING"; awaiting: ActiveAwaiting | null }
  | { type: "SET_AWAITING_RUNTIME"; activeAwaiting: ActiveAwaiting | null; pendingAwaitings: ActiveAwaiting[] }
  | { type: "PATCH_ACTIVE_AWAITING"; patch: { resolutionReason?: ActiveAwaiting["resolutionReason"]; pendingSubmitId?: string; loading?: boolean; loadError?: string; viewportHtml?: string } }
  | { type: "CLEAR_ACTIVE_AWAITING" }
  | { type: "SET_TOOL_STATE"; key: string; state: ToolState }
  | { type: "SET_PENDING_TOOL"; key: string; tool: PendingTool }
  | { type: "SET_ACTION_STATE"; key: string; state: ActionState }
  | { type: "ADD_EXECUTED_ACTION_ID"; actionId: string };

export function createInitialToolsState(): ToolsState {
  return {
    toolStates: new Map(), pendingTools: new Map(), actionStates: new Map(), executedActionIds: new Set(),
    activeFrontendTool: null, activeAwaiting: null, pendingAwaitings: [],
  };
}

export function reduceToolsState(state: ToolsState, action: ToolsAction): ToolsState {
  switch (action.type) {
    case "SET_ACTIVE_FRONTEND_TOOL": return { ...state, activeFrontendTool: action.tool };
    case "SET_ACTIVE_AWAITING": return { ...state, activeAwaiting: action.awaiting };
    case "SET_AWAITING_RUNTIME": return { ...state, activeAwaiting: action.activeAwaiting, pendingAwaitings: action.pendingAwaitings };
    case "CLEAR_ACTIVE_AWAITING": return { ...state, activeAwaiting: null };
    case "SET_TOOL_STATE": return { ...state, toolStates: new Map(state.toolStates).set(action.key, action.state) };
    case "SET_PENDING_TOOL": return { ...state, pendingTools: new Map(state.pendingTools).set(action.key, action.tool) };
    case "SET_ACTION_STATE": return { ...state, actionStates: new Map(state.actionStates).set(action.key, action.state) };
    case "ADD_EXECUTED_ACTION_ID": return { ...state, executedActionIds: new Set(state.executedActionIds).add(action.actionId) };
    case "PATCH_ACTIVE_AWAITING": return state;
  }
}
