import type {
	AppState,
	Chat,
	ChatActiveRunSummary,
	CurrentChatActiveRun,
} from "@/app/state/types";
import { isChatActiveRun } from "@/features/chats/lib/chatRunState";
import type { RunSession } from "@/features/runs/lib/runSession";
import { toText } from "@/shared/utils/eventUtils";

type QuerySessionsInput =
	| ReadonlyMap<string, RunSession>
	| { current: ReadonlyMap<string, RunSession> }
	| null
	| undefined;

type ActiveRequestInput =
	| string
	| { current: string }
	| null
	| undefined;

type AppStateInput = AppState | { current: AppState };

export interface SidebarChatRuntime {
	chatId: string;
	chat: Chat | null;
	session: RunSession | null;
	streaming: boolean;
	running: boolean;
	hasActiveRun: boolean;
	activeRun: ChatActiveRunSummary | null;
	runId: string;
}

export interface MainChatRuntime {
	chatId: string;
	requestId: string;
	session: RunSession | null;
	streaming: boolean;
	running: boolean;
	hasActiveRun: boolean;
	activeRun: CurrentChatActiveRun | null;
	runId: string;
	agentKey: string;
}

function readQuerySessions(input: QuerySessionsInput): ReadonlyMap<string, RunSession> {
	if (!input) {
		return new Map();
	}
	return "current" in input ? input.current : input;
}

function readActiveRequestId(input: ActiveRequestInput): string {
	if (!input) {
		return "";
	}
	return typeof input === "string" ? toText(input) : toText(input.current);
}

function readAppState(input: AppStateInput): AppState {
	return "current" in input ? input.current : input;
}

function findStreamingSessionForChat(
	chatId: string,
	sessions: ReadonlyMap<string, RunSession>,
): RunSession | null {
	const normalizedChatId = toText(chatId);
	if (!normalizedChatId) {
		return null;
	}
	for (const session of sessions.values()) {
		if (
			session.streaming &&
			toText(session.chatId) === normalizedChatId
		) {
			return session;
		}
	}
	return null;
}

function resolveCurrentChatActiveRun(
	state: AppState,
	chatId: string,
): CurrentChatActiveRun | null {
	const activeRun = state.currentChatActiveRun;
	if (!activeRun?.runId || activeRun.chatId !== chatId) {
		return null;
	}
	return activeRun;
}

function sessionMatchesMainChat(
	session: RunSession | null,
	chatId: string,
): boolean {
	if (!session) {
		return false;
	}
	const sessionChatId = toText(session.chatId);
	return !chatId || !sessionChatId || sessionChatId === chatId;
}

export function resolveSidebarChatRuntime(
	chatId: string,
	chats: Chat[],
	querySessions: QuerySessionsInput,
): SidebarChatRuntime {
	const normalizedChatId = toText(chatId);
	const sessions = readQuerySessions(querySessions);
	const chat =
		(Array.isArray(chats)
			? chats.find((item) => toText(item?.chatId) === normalizedChatId)
			: null) || null;
	const session = findStreamingSessionForChat(normalizedChatId, sessions);
	const chatHasActiveRun = isChatActiveRun(chat);
	const streaming = Boolean(session?.streaming);
	const activeRun = chatHasActiveRun
		? ((chat?.activeRun || null) as ChatActiveRunSummary | null)
		: null;
	const runId =
		toText(session?.runId) ||
		toText(activeRun?.runId) ||
		toText(chat?.lastRunId);

	return {
		chatId: normalizedChatId,
		chat,
		session,
		streaming,
		running: streaming || chatHasActiveRun,
		hasActiveRun: streaming || chatHasActiveRun,
		activeRun,
		runId,
	};
}

export function resolveMainChatRuntime(
	stateInput: AppStateInput,
	activeQuerySessionRequestId: ActiveRequestInput,
	querySessions: QuerySessionsInput,
): MainChatRuntime {
	const state = readAppState(stateInput);
	const chatId = toText(state.chatId);
	const requestId = readActiveRequestId(activeQuerySessionRequestId);
	const sessions = readQuerySessions(querySessions);
	const activeSession = requestId ? sessions.get(requestId) || null : null;
	const session =
		activeSession && sessionMatchesMainChat(activeSession, chatId)
			? activeSession
			: null;
	const streaming = Boolean(session?.streaming);
	const activeRun = resolveCurrentChatActiveRun(state, chatId);
	const hasActiveRun = Boolean(activeRun?.runId);
	const runId =
		toText(session?.runId) ||
		toText(activeRun?.runId) ||
		toText(state.runId);
	const agentKey =
		toText(session?.agentKey) ||
		toText(activeRun?.agentKey) ||
		toText(state.currentRunAgentKey) ||
		toText(state.runAgentById.get(runId));

	return {
		chatId,
		requestId: session ? requestId : "",
		session,
		streaming,
		running: streaming || hasActiveRun,
		hasActiveRun,
		activeRun,
		runId,
		agentKey,
	};
}
