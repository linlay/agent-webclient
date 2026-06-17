import type {
	AIAwaitApproval,
	AIAwaitForm,
	AIAwaitPlan,
	AIAwaitQuestion,
} from "@/app/state/eventTypes";
import { ViewportTypeEnum } from "@/app/state/eventTypes";

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

export interface TaskItemMeta {
	taskId: string;
	taskName: string;
	taskGroupId: string;
	subAgentKey?: string;
	runId: string;
	status: string;
	startedAt?: number;
	endedAt?: number;
	durationMs?: number;
	updatedAt: number;
	error: string;
}

export interface ActiveFrontendTool {
	key: string;
	runId: string;
	agentKey: string;
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
	timeout: number | null;
	createdAt?: number | null;
	resolvedByOther?: boolean;
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
