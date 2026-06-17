import type { AppAction } from "@/app/state/AppContext";
import type { AgentEvent, AppState, TimelineNode } from "@/app/state/types";
import type { EventCommand } from "@/features/timeline/lib/eventProcessor";
import {
	getCachedNode,
	type LocalCache,
} from "@/features/timeline/lib/localEventCache";
import { toText } from "@/shared/utils/eventUtils";

export function applyLiveEventCommand(input: {
	command: EventCommand;
	cache: LocalCache;
	state: AppState;
	dispatch: (action: AppAction) => void;
}): void {
	const { command, cache, state, dispatch } = input;

	switch (command.cmd) {
		case "SET_CHAT_ID":
			cache.chatId = command.chatId;
			dispatch({ type: "SET_CHAT_ID", chatId: command.chatId });
			return;
		case "SET_RUN_ID":
			cache.runId = command.runId;
			dispatch({ type: "SET_RUN_ID", runId: command.runId });
			return;
		case "SET_CHAT_AGENT":
			cache.agentKey = command.agentKey;
			dispatch({ type: "SET_CHAT_AGENT_BY_ID", chatId: command.chatId, agentKey: command.agentKey });
			return;
		case "SET_CONTENT_NODE_ID":
			cache.contentNodeById.set(command.contentId, command.nodeId);
			dispatch({ type: "INCREMENT_TIMELINE_COUNTER" });
			dispatch({ type: "SET_CONTENT_NODE_BY_ID", contentId: command.contentId, nodeId: command.nodeId });
			return;
		case "SET_REASONING_NODE_ID":
			cache.reasoningNodeById.set(command.reasoningId, command.nodeId);
			dispatch({ type: "INCREMENT_TIMELINE_COUNTER" });
			dispatch({ type: "SET_REASONING_NODE_BY_ID", reasoningId: command.reasoningId, nodeId: command.nodeId });
			return;
		case "SET_TOOL_NODE_ID":
			cache.toolNodeById.set(command.toolId, command.nodeId);
			dispatch({ type: "INCREMENT_TIMELINE_COUNTER" });
			dispatch({ type: "SET_TOOL_NODE_BY_ID", toolId: command.toolId, nodeId: command.nodeId });
			return;
		case "APPEND_TIMELINE_ORDER":
			dispatch({ type: "APPEND_TIMELINE_ORDER", id: command.nodeId });
			return;
		case "SET_TIMELINE_NODE": {
			const existingNode = getCachedNode(cache, state, command.id);
			const nextNode: TimelineNode = command.node.kind === "content"
				? {
						...command.node,
						ttsVoiceBlocks: existingNode?.kind === "content" ? (existingNode.ttsVoiceBlocks || {}) : {},
					}
				: command.node;
			cache.nodeById.set(command.id, nextNode);
			cache.nodeText.set(command.id, nextNode.text || "");
			dispatch({ type: "SET_TIMELINE_NODE", id: command.id, node: nextNode });
			return;
		}
		case "SET_TOOL_STATE":
			cache.toolStateById.set(command.toolId, command.state);
			dispatch({ type: "SET_TOOL_STATE", key: command.toolId, state: command.state });
			return;
		case "SET_ACTIVE_REASONING_KEY":
			cache.activeReasoningKey = command.key;
			dispatch({ type: "SET_ACTIVE_REASONING_KEY", key: command.key });
			return;
		case "UPSERT_ARTIFACT":
			dispatch({ type: "UPSERT_ARTIFACT", artifact: command.artifact });
			return;
		case "UPSERT_FILE_CHANGE":
			dispatch({ type: "UPSERT_FILE_CHANGE", fileChange: command.fileChange });
			return;
		case "UPSERT_FILE_CONTENT_SNAPSHOT":
			cache.fileContentSnapshots.set(command.snapshot.filePath, command.snapshot);
			dispatch({
				type: "UPSERT_FILE_CONTENT_SNAPSHOT",
				snapshot: command.snapshot,
			});
			return;
		case "SET_PLAN":
			if (command.resetRuntime) {
				dispatch({
					type: "BATCH_UPDATE",
					updates: {
						planRuntimeByTaskId: new Map(),
						planCurrentRunningTaskId: "",
						planLastTouchedTaskId: "",
					},
				});
			}
			dispatch({ type: "SET_PLAN", plan: command.plan });
			return;
		case "SET_PLAN_RUNTIME":
			dispatch({ type: "SET_PLAN_RUNTIME", taskId: command.taskId, runtime: command.runtime });
			return;
		case "SET_TASK_ITEM_META":
			cache.taskItemsById.set(command.taskId, command.task);
			dispatch({ type: "SET_TASK_ITEM_META", taskId: command.taskId, task: command.task });
			return;
		case "ADD_ACTIVE_TASK_ID":
			cache.activeTaskIds.add(command.taskId);
			dispatch({ type: "ADD_ACTIVE_TASK_ID", taskId: command.taskId });
			return;
		case "REMOVE_ACTIVE_TASK_ID":
			cache.activeTaskIds.delete(command.taskId);
			dispatch({ type: "REMOVE_ACTIVE_TASK_ID", taskId: command.taskId });
			return;
		case "SET_PLAN_CURRENT_RUNNING_TASK_ID":
			dispatch({ type: "SET_PLAN_CURRENT_RUNNING_TASK_ID", taskId: command.taskId });
			return;
		case "SET_PLAN_LAST_TOUCHED_TASK_ID":
			dispatch({ type: "SET_PLAN_LAST_TOUCHED_TASK_ID", taskId: command.taskId });
			return;
		case "USER_MESSAGE":
			cache.nodeById.set(command.nodeId, {
				id: command.nodeId,
				kind: "message",
				role: "user",
				messageVariant: command.variant,
				steerId: command.steerId,
				text: command.text,
				attachments: command.attachments,
				ts: command.ts,
				taskId: command.taskId,
				taskName: command.taskName,
				taskGroupId: command.taskGroupId,
				subAgentKey: command.subAgentKey,
			});
			cache.nodeText.set(command.nodeId, command.text);
			dispatch({
				type: "SET_TIMELINE_NODE",
				id: command.nodeId,
				node: {
					id: command.nodeId,
					kind: "message",
					role: "user",
					messageVariant: command.variant,
					steerId: command.steerId,
					text: command.text,
					attachments: command.attachments,
					ts: command.ts,
					taskId: command.taskId,
					taskName: command.taskName,
					taskGroupId: command.taskGroupId,
					subAgentKey: command.subAgentKey,
				},
			});
			dispatch({ type: "APPEND_TIMELINE_ORDER", id: command.nodeId });
			return;
		case "SYSTEM_ERROR":
		case "SYSTEM_MESSAGE":
			cache.nodeById.set(command.nodeId, {
				id: command.nodeId,
				kind: "message",
				role: "system",
				text: command.text,
				...(command.cmd === "SYSTEM_ERROR" && command.errorDetail
					? { errorDetail: command.errorDetail }
					: {}),
				ts: command.ts,
			});
			cache.nodeText.set(command.nodeId, command.text);
			dispatch({
				type: "SET_TIMELINE_NODE",
				id: command.nodeId,
				node: {
					id: command.nodeId,
					kind: "message",
					role: "system",
					text: command.text,
					...(command.cmd === "SYSTEM_ERROR" && command.errorDetail
						? { errorDetail: command.errorDetail }
						: {}),
					ts: command.ts,
				},
			});
			dispatch({ type: "APPEND_TIMELINE_ORDER", id: command.nodeId });
			return;
	}
}

export function findMatchingPendingSteer(state: AppState, event: AgentEvent) {
	const steerId = toText(event.steerId);
	if (!steerId) {
		return null;
	}
	return state.pendingSteers.find((steer) => toText(steer.steerId) === steerId) || null;
}
