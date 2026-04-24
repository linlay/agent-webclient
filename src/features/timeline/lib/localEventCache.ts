import type {
	ActiveAwaiting,
	AgentGroup,
	AppState,
	TaskGroupMeta,
	TaskItemMeta,
	TimelineNode,
	ToolState,
} from "@/app/state/types";
import type { EventProcessorState } from "@/features/timeline/lib/eventProcessor";
import { toText } from "@/shared/utils/eventUtils";

/**
 * Local mutable cache to track node IDs and text between React renders.
 * This is critical because React 18 batches dispatches, so stateRef
 * may not reflect the latest state when multiple events arrive rapidly.
 */
export interface LocalCache {
	contentNodeById: Map<string, string>;
	reasoningNodeById: Map<string, string>;
	toolNodeById: Map<string, string>;
	toolStateById: Map<string, ToolState>;
	taskItemsById: Map<string, TaskItemMeta>;
	taskGroupsById: Map<string, TaskGroupMeta>;
	activeTaskIds: Set<string>;
	agentGroupsByGroupId: Map<string, AgentGroup>;
	groupIdByTaskId: Map<string, string>;
	groupIdByMainToolId: Map<string, string>;
	nodeById: Map<string, TimelineNode>;
	nodeText: Map<string, string>;
	counter: number;
	activeReasoningKey: string;
	activeAwaiting: ActiveAwaiting | null;
	chatId: string;
	runId: string;
	agentKey: string;
	teamId: string;
}

export function createLocalCache(): LocalCache {
	return {
		contentNodeById: new Map(),
		reasoningNodeById: new Map(),
		toolNodeById: new Map(),
		toolStateById: new Map(),
		taskItemsById: new Map(),
		taskGroupsById: new Map(),
		activeTaskIds: new Set(),
		agentGroupsByGroupId: new Map(),
		groupIdByTaskId: new Map(),
		groupIdByMainToolId: new Map(),
		nodeById: new Map(),
		nodeText: new Map(),
		counter: 0,
		activeReasoningKey: "",
		activeAwaiting: null,
		chatId: "",
		runId: "",
		agentKey: "",
		teamId: "",
	};
}

export function createLocalCacheFromState(state: AppState): LocalCache {
	const chatId = toText(state.chatId);
	const nodeText = new Map<string, string>();
	state.timelineNodes.forEach((node, nodeId) => {
		nodeText.set(nodeId, node.text || "");
	});
	return {
		contentNodeById: new Map(state.contentNodeById),
		reasoningNodeById: new Map(state.reasoningNodeById),
		toolNodeById: new Map(state.toolNodeById),
		toolStateById: new Map(state.toolStates),
		taskItemsById: new Map(state.taskItemsById),
		taskGroupsById: new Map(state.taskGroupsById),
		activeTaskIds: new Set(state.activeTaskIds),
		agentGroupsByGroupId: new Map(state.agentGroupsByGroupId),
		groupIdByTaskId: new Map(state.groupIdByTaskId),
		groupIdByMainToolId: new Map(state.groupIdByMainToolId),
		nodeById: new Map(state.timelineNodes),
		nodeText,
		counter: state.timelineCounter,
		activeReasoningKey: toText(state.activeReasoningKey),
		activeAwaiting: state.activeAwaiting,
		chatId,
		runId: toText(state.runId),
		agentKey: chatId ? toText(state.chatAgentById.get(chatId)) : "",
		teamId: "",
	};
}

export function getCachedNode(
	cache: LocalCache,
	state: AppState,
	nodeId: string,
): TimelineNode | undefined {
	const cachedNode = cache.nodeById.get(nodeId);
	if (cachedNode !== undefined) {
		return cachedNode;
	}
	return state.timelineNodes.get(nodeId);
}

export function getCachedNodeText(
	cache: LocalCache,
	state: AppState,
	nodeId: string,
): string {
	const cachedText = cache.nodeText.get(nodeId);
	if (cachedText !== undefined) {
		return cachedText;
	}
	const cachedNode = cache.nodeById.get(nodeId);
	if (cachedNode?.text !== undefined) {
		return cachedNode.text;
	}
	return state.timelineNodes.get(nodeId)?.text || "";
}

export function shouldSyncLiveCache(
	cache: LocalCache,
	state: AppState,
): boolean {
	const visibleChatId = toText(state.chatId);
	const visibleRunId = toText(state.runId);
	const hasVisibleConversation =
		state.timelineOrder.length > 0 ||
		Boolean(visibleChatId) ||
		Boolean(visibleRunId) ||
		state.streaming;

	if (!hasVisibleConversation) {
		return false;
	}

	return (
		cache.chatId !== visibleChatId ||
		cache.runId !== visibleRunId ||
		shouldSyncActiveAwaitingFromState(cache, state) ||
		cache.counter < state.timelineCounter ||
		hasStateAheadNodeMap(cache.contentNodeById, state.contentNodeById) ||
		hasStateAheadNodeMap(cache.reasoningNodeById, state.reasoningNodeById) ||
		hasStateAheadNodeMap(cache.toolNodeById, state.toolNodeById) ||
		hasStateAheadObjectMap(cache.taskItemsById, state.taskItemsById) ||
		hasStateAheadObjectMap(cache.taskGroupsById, state.taskGroupsById) ||
		hasStateAheadObjectMap(cache.agentGroupsByGroupId, state.agentGroupsByGroupId) ||
		hasStateAheadNodeText(cache, state)
	);
}

export function createLiveProcessorState(
	cache: LocalCache,
	state: AppState,
): EventProcessorState {
	return {
		getContentNodeId: (contentId) => cache.contentNodeById.get(contentId) ?? state.contentNodeById.get(contentId),
		getReasoningNodeId: (reasoningKey) => cache.reasoningNodeById.get(reasoningKey) ?? state.reasoningNodeById.get(reasoningKey),
		getToolNodeId: (toolId) => cache.toolNodeById.get(toolId) ?? state.toolNodeById.get(toolId),
		getToolState: (toolId) => cache.toolStateById.get(toolId) ?? state.toolStates.get(toolId),
		getTimelineNode: (nodeId) => getCachedNode(cache, state, nodeId),
		getNodeText: (nodeId) => getCachedNodeText(cache, state, nodeId),
		nextCounter: () => cache.counter++,
		peekCounter: () => cache.counter,
		activeReasoningKey: cache.activeReasoningKey || state.activeReasoningKey,
		chatId: cache.chatId || toText(state.chatId),
		runId: cache.runId || toText(state.runId),
		currentRunningPlanTaskId: state.planCurrentRunningTaskId,
		getTaskItem: (taskId) => cache.taskItemsById.get(taskId) ?? state.taskItemsById.get(taskId),
		getTaskGroup: (groupId) => cache.taskGroupsById.get(groupId) ?? state.taskGroupsById.get(groupId),
		getAgentGroup: (groupId) => cache.agentGroupsByGroupId.get(groupId) ?? state.agentGroupsByGroupId.get(groupId),
		getActiveTaskIds: () => Array.from(cache.activeTaskIds.size > 0 ? cache.activeTaskIds : state.activeTaskIds),
		getPlanTaskDescription: (taskId) =>
			state.plan?.plan.find((item) => item.taskId === taskId)?.description,
		getPlanId: () => state.plan?.planId,
	};
}

function hasStateAheadNodeMap(
	cacheMap: Map<string, string>,
	stateMap: Map<string, string>,
): boolean {
	if (stateMap.size > cacheMap.size) {
		return true;
	}
	for (const key of stateMap.keys()) {
		if (!cacheMap.has(key)) {
			return true;
		}
	}
	return false;
}

function hasStateAheadObjectMap<T>(
	cacheMap: Map<string, T>,
	stateMap: Map<string, T>,
): boolean {
	if (stateMap.size > cacheMap.size) {
		return true;
	}
	for (const key of stateMap.keys()) {
		if (!cacheMap.has(key)) {
			return true;
		}
	}
	return false;
}

function shouldSyncNodeTextFromState(
	cacheText: string | undefined,
	stateText: string,
	streaming: boolean,
): boolean {
	if (cacheText === undefined) {
		return true;
	}
	if (cacheText === stateText) {
		return false;
	}
	if (stateText.startsWith(cacheText)) {
		return true;
	}
	if (cacheText.startsWith(stateText)) {
		return false;
	}
	return !streaming;
}

function hasStateAheadNodeText(cache: LocalCache, state: AppState): boolean {
	for (const [nodeId, node] of state.timelineNodes.entries()) {
		if (
			node.kind !== "content" &&
			node.kind !== "thinking" &&
			node.kind !== "awaiting-answer" &&
			node.kind !== "tool"
		) {
			continue;
		}
		const stateText = node.text || "";
		const cacheText = cache.nodeText.get(nodeId);
		if (shouldSyncNodeTextFromState(cacheText, stateText, state.streaming)) {
			return true;
		}
	}
	return false;
}

function normalizeAwaitingItemsSignature(
	awaiting: ActiveAwaiting | null,
): string {
	if (!awaiting) {
		return "";
	}
	if (awaiting.mode === "question") {
		return awaiting.questions?.length > 0 ? JSON.stringify(awaiting.questions) : "";
	}
	if (awaiting.mode === "approval") {
		return awaiting.approvals?.length > 0 ? JSON.stringify(awaiting.approvals) : "";
	}
	return awaiting.forms?.length > 0 ? JSON.stringify(awaiting.forms) : "";
}

function normalizeAwaitingRuntimeSignature(
	awaiting: ActiveAwaiting | null,
): string {
	if (!awaiting) {
		return "";
	}

	return JSON.stringify({
		mode: awaiting.mode,
		viewportType: awaiting.mode === "form" ? awaiting.viewportType : "",
		viewportKey: awaiting.mode === "form" ? awaiting.viewportKey : "",
		loading: awaiting.mode === "form" ? awaiting.loading : false,
		loadError: awaiting.mode === "form" ? awaiting.loadError : "",
		viewportHtml: awaiting.mode === "form" ? awaiting.viewportHtml : "",
		resolvedByOther: Boolean(awaiting.resolvedByOther),
	});
}

function shouldSyncActiveAwaitingFromState(
	cache: LocalCache,
	state: AppState,
): boolean {
	const stateAwaiting = state.activeAwaiting;
	const cacheAwaiting = cache.activeAwaiting;

	if (!stateAwaiting) {
		return false;
	}

	if (!cacheAwaiting) {
		return true;
	}

	if (stateAwaiting.key !== cacheAwaiting.key) {
		return false;
	}

	if (
		stateAwaiting.timeout !== cacheAwaiting.timeout &&
		stateAwaiting.timeout !== null
	) {
		return true;
	}

	return (
		normalizeAwaitingItemsSignature(stateAwaiting) !==
			normalizeAwaitingItemsSignature(cacheAwaiting) ||
		normalizeAwaitingRuntimeSignature(stateAwaiting) !==
			normalizeAwaitingRuntimeSignature(cacheAwaiting)
	);
}
