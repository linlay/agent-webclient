import type { AgentEvent, AppState, Chat } from "@/app/state/types";
import { toText } from "@/shared/utils/eventUtils";

export function bindRunAgentKey(
	source: Map<string, string>,
	runId: string,
	agentKey: string,
): Map<string, string> {
	const normalizedRunId = toText(runId);
	const normalizedAgentKey = toText(agentKey);
	if (!normalizedRunId || !normalizedAgentKey) {
		return source;
	}
	if (source.get(normalizedRunId) === normalizedAgentKey) {
		return source;
	}
	const next = new Map(source);
	next.set(normalizedRunId, normalizedAgentKey);
	return next;
}

export function readRunAgentKeyFromEvent(
	event: AgentEvent,
): { runId: string; agentKey: string } | null {
	const runId = toText(event.runId);
	const agentKey = toText(event.agentKey);
	return runId && agentKey ? { runId, agentKey } : null;
}

export function resolveRunAgentKey(input: {
	runId?: unknown;
	currentRunAgentKey?: unknown;
	runAgentById?: Map<string, string>;
	agentKey?: unknown;
	chatId?: unknown;
	chatAgentById?: Map<string, string>;
	chats?: Array<Partial<Chat>>;
	fallbackAgentKey?: unknown;
}): string {
	const runId = toText(input.runId);
	return (
		toText(input.agentKey)
		|| (runId ? toText(input.runAgentById?.get(runId)) : "")
		|| toText(input.currentRunAgentKey)
		|| resolveChatAgentKey(input)
		|| toText(input.fallbackAgentKey)
	);
}

export function resolveChatAgentKey(input: {
	chatId?: unknown;
	chatAgentById?: Map<string, string>;
	chats?: Array<Partial<Chat>>;
}): string {
	const chatId = toText(input.chatId);
	if (!chatId) {
		return "";
	}
	const chat = input.chats?.find((item) => toText(item?.chatId) === chatId);
	return (
		toText(chat?.agentKey)
		|| toText(chat?.firstAgentKey)
		|| toText(input.chatAgentById?.get(chatId))
	);
}

export function resolveStateRunAgentKey(
	state: Pick<
		AppState,
		| "runId"
		| "currentRunAgentKey"
		| "runAgentById"
		| "chatId"
		| "chatAgentById"
		| "chats"
	>,
	runId?: unknown,
): string {
	return resolveRunAgentKey({
		runId: toText(runId) || state.runId,
		currentRunAgentKey: state.currentRunAgentKey,
		runAgentById: state.runAgentById,
		chatId: state.chatId,
		chatAgentById: state.chatAgentById,
		chats: state.chats,
	});
}
