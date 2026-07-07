import type { AppState } from "@/app/state/types";
import { createLiveQuerySession } from "@/features/chats/lib/conversationSession";
import {
	resolveMainChatRuntime,
	resolveSidebarChatRuntime,
} from "@/features/chats/lib/chatRuntimeState";

function buildState(patch: Partial<AppState> = {}): AppState {
	return {
		chatId: "",
		runId: "",
		streaming: false,
		currentChatActiveRun: null,
		currentRunAgentKey: "",
		runAgentById: new Map(),
		...patch,
	} as AppState;
}

describe("chatRuntimeState", () => {
	it("keeps sidebar chat runtime keyed by chatId instead of current chat", () => {
		const session = createLiveQuerySession({
			requestId: "req_bg",
			chatId: "chat_background",
			agentKey: "agent_a",
		});
		session.runId = "run_bg";
		session.streaming = true;
		const querySessionsRef = { current: new Map([["req_bg", session]]) };

		const runtime = resolveSidebarChatRuntime(
			"chat_background",
			[
				{
					chatId: "chat_background",
					agentKey: "agent_a",
					hasActiveRun: false,
				},
			],
			querySessionsRef,
		);

		expect(runtime.running).toBe(true);
		expect(runtime.streaming).toBe(true);
		expect(runtime.runId).toBe("run_bg");
	});

	it("keeps main chat runtime scoped to the active current-chat session", () => {
		const activeSession = createLiveQuerySession({
			requestId: "req_active",
			chatId: "chat_current",
			agentKey: "agent_a",
		});
		activeSession.runId = "run_current";
		activeSession.streaming = true;
		const backgroundSession = createLiveQuerySession({
			requestId: "req_bg",
			chatId: "chat_background",
			agentKey: "agent_b",
		});
		backgroundSession.runId = "run_bg";
		backgroundSession.streaming = true;
		const querySessionsRef = {
			current: new Map([
				["req_active", activeSession],
				["req_bg", backgroundSession],
			]),
		};

		const runtime = resolveMainChatRuntime(
			buildState({
				chatId: "chat_current",
				streaming: false,
			}),
			{ current: "req_active" },
			querySessionsRef,
		);

		expect(runtime.streaming).toBe(true);
		expect(runtime.runId).toBe("run_current");
		expect(runtime.agentKey).toBe("agent_a");
	});

	it("ignores stale state.streaming when no active main session is running", () => {
		const runtime = resolveMainChatRuntime(
			buildState({
				chatId: "chat_current",
				runId: "run_old",
				streaming: true,
			}),
			{ current: "" },
			{ current: new Map() },
		);

		expect(runtime.streaming).toBe(false);
		expect(runtime.running).toBe(false);
	});
});
