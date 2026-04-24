import type {
	AIAwaitApproval,
	AIAwaitForm,
	AIAwaitQuestion,
} from "@/app/state/eventTypes";
import { ViewportTypeEnum } from "@/app/state/eventTypes";

export interface ToolState {
	toolId: string;
	argsBuffer: string;
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

export interface TaskGroupMeta {
	groupId: string;
	runId: string;
	title: string;
	explicitTitle?: string;
	status: string;
	startedAt?: number;
	endedAt?: number;
	durationMs?: number;
	updatedAt: number;
	childTaskIds: string[];
}

export interface AgentGroup {
	groupId: string;
	mainToolId: string;
	taskIds: string[];
	createdAt: number;
}

export interface ActiveFrontendTool {
	key: string;
	runId: string;
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

interface ActiveAwaitingBase {
	key: string;
	awaitingId: string;
	runId: string;
	timeout: number | null;
	resolvedByOther?: boolean;
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

export type ActiveAwaiting =
	| QuestionActiveAwaiting
	| ApprovalActiveAwaiting
	| FormActiveAwaiting;
