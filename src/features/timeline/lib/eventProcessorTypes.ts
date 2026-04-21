import type {
	AgentGroup,
	Plan,
	PlanRuntime,
	PublishedArtifact,
	TaskGroupMeta,
	TaskItemMeta,
	TimelineNode,
	ToolState,
} from "@/app/state/types";

export interface EventProcessorState {
	getContentNodeId(contentId: string): string | undefined;
	getReasoningNodeId(reasoningKey: string): string | undefined;
	getToolNodeId(toolId: string): string | undefined;
	getToolState(toolId: string): ToolState | undefined;
	getTimelineNode(nodeId: string): TimelineNode | undefined;
	getNodeText(nodeId: string): string;
	nextCounter(): number;
	peekCounter(): number;
	activeReasoningKey: string;
	chatId: string;
	runId: string;
	currentRunningPlanTaskId?: string;
	getTaskItem(taskId: string): TaskItemMeta | undefined;
	getTaskGroup(groupId: string): TaskGroupMeta | undefined;
	getAgentGroup?(groupId: string): AgentGroup | undefined;
	getActiveTaskIds(): string[];
	getPlanTaskDescription?(taskId: string): string | undefined;
	getPlanId?(): string | undefined;
}

export interface EventProcessorConfig {
	mode: "live" | "replay";
	reasoningExpandedDefault: boolean;
}

export type EventCommand =
	| { cmd: "SET_CHAT_ID"; chatId: string }
	| { cmd: "SET_RUN_ID"; runId: string }
	| { cmd: "SET_CHAT_AGENT"; chatId: string; agentKey: string }
	| { cmd: "SET_CONTENT_NODE_ID"; contentId: string; nodeId: string }
	| { cmd: "SET_REASONING_NODE_ID"; reasoningId: string; nodeId: string }
	| { cmd: "SET_TOOL_NODE_ID"; toolId: string; nodeId: string }
	| { cmd: "APPEND_TIMELINE_ORDER"; nodeId: string }
	| { cmd: "SET_TIMELINE_NODE"; id: string; node: TimelineNode }
	| { cmd: "SET_TOOL_STATE"; toolId: string; state: ToolState }
	| { cmd: "SET_ACTIVE_REASONING_KEY"; key: string }
	| { cmd: "UPSERT_ARTIFACT"; artifact: PublishedArtifact }
	| { cmd: "SET_PLAN"; plan: Plan | null; resetRuntime: boolean }
	| { cmd: "SET_PLAN_RUNTIME"; taskId: string; runtime: PlanRuntime }
	| { cmd: "SET_TASK_ITEM_META"; taskId: string; task: TaskItemMeta }
	| { cmd: "SET_TASK_GROUP_META"; groupId: string; group: TaskGroupMeta }
	| { cmd: "SET_AGENT_GROUP_ADD_TASK"; groupId: string; group: AgentGroup }
	| { cmd: "ADD_ACTIVE_TASK_ID"; taskId: string }
	| { cmd: "REMOVE_ACTIVE_TASK_ID"; taskId: string }
	| { cmd: "SET_PLAN_CURRENT_RUNNING_TASK_ID"; taskId: string }
	| { cmd: "SET_PLAN_LAST_TOUCHED_TASK_ID"; taskId: string }
	| {
			cmd: "USER_MESSAGE";
			nodeId: string;
			text: string;
			ts: number;
			variant: "default" | "steer" | "remember" | "learn";
			attachments?: TimelineNode["attachments"];
			steerId?: string;
	  }
	| { cmd: "SYSTEM_ERROR"; nodeId: string; text: string; ts: number };
