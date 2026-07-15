import type { AppAction } from "@/app/state/AppContext";
import type { AppState, Chat } from "@/app/state/types";
import type { RunSession } from "@/features/runs/lib/runSession";
import {
	AGENT_RUN_STARTED_PUSH_EVENT,
	resolveMainChatRouteAgentKey,
	resolveMainChatRunActivation,
	resolveMainChatTargetAgentKey,
} from "@/features/runs/lib/mainChatRunActivation";
import { registerMainChatRunActivationListener } from "@/features/runs/hooks/useMainChatRunActivation";

const DEBUG_RUN_OBSERVATION_EVENT_TYPE = "debug.runObservation";
const globalWithRuntimeConfig = globalThis as typeof globalThis & {
	__AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

function createRunSession(input: {
	requestId: string;
	chatId?: string;
	agentKey?: string;
}): RunSession {
	return {
		requestId: input.requestId,
		chatId: input.chatId || "",
		runId: "",
		agentKey: input.agentKey || "",
		teamId: "",
		streaming: false,
		abortController: null,
		snapshot: null,
		bufferedEvents: [],
		bufferedDebugLines: [],
		appliedEventCount: 0,
		appliedDebugLineCount: 0,
	};
}

beforeEach(() => {
	globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
		DEBUG_RUN_OBSERVATION_ENABLED: "true",
	};
});

afterEach(() => {
	delete globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
});

function createState(overrides: Partial<AppState> = {}): AppState {
	return {
		chatId: "",
		runId: "",
		streaming: false,
		workerSelectionKey: "",
		pendingNewChatAgentKey: "",
		runAgentById: new Map(),
		chatAgentById: new Map(),
		chats: [],
		...overrides,
	} as AppState;
}

function setupMockWindow(pathname = "/agent/demo"): {
	mockWindow: {
		location: { pathname: string };
		dispatched: Array<{ type: string; detail?: unknown }>;
		addEventListener: jest.Mock;
		removeEventListener: jest.Mock;
		dispatchEvent: jest.Mock<boolean, [Event]>;
	};
	MockCustomEvent: new (...args: any[]) => any;
} {
	const listeners = new Map<string, Set<(event: Event) => void>>();
	const mockWindow = {
		location: { pathname },
		dispatched: [] as Array<{ type: string; detail?: unknown }>,
		addEventListener: jest.fn((type: string, listener: (event: Event) => void) => {
			const current = listeners.get(type) || new Set();
			current.add(listener);
			listeners.set(type, current);
		}),
		removeEventListener: jest.fn((type: string, listener: (event: Event) => void) => {
			listeners.get(type)?.delete(listener);
		}),
		dispatchEvent: jest.fn((event: Event): boolean => {
			mockWindow.dispatched.push({
				type: event.type,
				detail: (event as CustomEvent).detail,
			});
			for (const listener of listeners.get(event.type) || []) {
				listener(event);
			}
			return true;
		}),
	};
	class MockCustomEvent {
		type: string;
		detail: unknown;
		constructor(type: string, init?: { detail?: unknown }) {
			this.type = type;
			this.detail = init?.detail;
		}
	}
	Object.defineProperty(globalThis, "window", {
		value: mockWindow,
		configurable: true,
		writable: true,
	});
	Object.defineProperty(globalThis, "CustomEvent", {
		value: MockCustomEvent,
		configurable: true,
		writable: true,
	});
	return { mockWindow, MockCustomEvent };
}

function restoreWindow() {
	delete (globalThis as { window?: unknown }).window;
	delete (globalThis as { CustomEvent?: unknown }).CustomEvent;
}

function dispatchRunStarted(MockCustomEvent: new (...args: any[]) => any, detail: unknown) {
	window.dispatchEvent(
		new MockCustomEvent(AGENT_RUN_STARTED_PUSH_EVENT, {
			detail,
		}) as Event,
	);
}

function eventDetails(
	mockWindow: ReturnType<typeof setupMockWindow>["mockWindow"],
	type: string,
): unknown[] {
	return mockWindow.dispatched
		.filter((event) => event.type === type)
		.map((event) => event.detail);
}

function debugEvents(dispatch: jest.Mock<void, [AppAction]>, stage?: string) {
	return dispatch.mock.calls
		.map(([action]) => action)
		.filter(
			(action) =>
				action.type === "PUSH_EVENT" &&
				action.event.type === DEBUG_RUN_OBSERVATION_EVENT_TYPE &&
				(!stage || (action.event as Record<string, unknown>).stage === stage),
		)
		.map((action) => (action as Extract<AppAction, { type: "PUSH_EVENT" }>).event);
}

describe("main chat run activation helpers", () => {
	afterEach(() => {
		restoreWindow();
	});

	it("resolves route agent keys from main chat routes", () => {
		expect(resolveMainChatRouteAgentKey("/agent/demo")).toBe("demo");
		expect(resolveMainChatRouteAgentKey("/copilot/demo")).toBe("demo");
		expect(resolveMainChatRouteAgentKey("/agent/demo%2Fencoded")).toBe("demo/encoded");
		expect(resolveMainChatRouteAgentKey("/agents/demo")).toBe("");
	});

	it("resolves target agent from worker selection, pending new chat, and active chat fallback", () => {
		expect(
			resolveMainChatTargetAgentKey(
				createState({ workerSelectionKey: "agent:worker_demo" }),
				"/",
			),
		).toBe("worker_demo");
		expect(
			resolveMainChatTargetAgentKey(
				createState({ pendingNewChatAgentKey: "pending_demo" }),
				"/",
			),
		).toBe("pending_demo");
		expect(
			resolveMainChatTargetAgentKey(
				createState({
					chatId: "chat_1",
					chats: [{ chatId: "chat_1", agentKey: "chat_demo" } as Chat],
				}),
				"/",
			),
		).toBe("chat_demo");
	});

	it("rejects run.started candidates outside the active chat", () => {
		const decision = resolveMainChatRunActivation({
			state: createState({
				chatId: "chat_active",
				workerSelectionKey: "agent:demo",
			}),
			pathname: "/",
			detail: {
				chatId: "chat_other",
				runId: "run_1",
				agentKey: "demo",
			},
		});

		expect(decision).toEqual(
			expect.objectContaining({
				shouldActivate: false,
				reason: "chat_mismatch",
				targetAgentKey: "demo",
			}),
		);
	});

	it("does not reject same-chat candidates only because state.streaming is true", () => {
		const decision = resolveMainChatRunActivation({
			state: createState({
				chatId: "chat_active",
				runId: "run_old",
				streaming: true,
				workerSelectionKey: "agent:demo",
			}),
			pathname: "/",
			detail: {
				chatId: "chat_active",
				runId: "run_new",
				agentKey: "demo",
			},
		});

		expect(decision).toEqual(
			expect.objectContaining({
				shouldActivate: true,
				chatId: "chat_active",
				runId: "run_new",
				agentKey: "demo",
			}),
		);
	});
});

describe("registerMainChatRunActivationListener", () => {
	let dispatch: jest.Mock<void, [AppAction]>;
	let querySessionsRef: { current: Map<string, ReturnType<typeof createRunSession>> };
	let activeQuerySessionRequestIdRef: { current: string };

	beforeEach(() => {
		dispatch = jest.fn();
		querySessionsRef = { current: new Map() };
		activeQuerySessionRequestIdRef = { current: "" };
	});

	afterEach(() => {
		restoreWindow();
	});

	it("ignores a run.started candidate when it is not for the active chat", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/agent/demo");
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: { current: createState() },
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			handledRunKeysRef: { current: new Set() },
		});

		dispatchRunStarted(MockCustomEvent, {
			chatId: "chat_1",
			runId: "run_1",
			agentKey: "demo",
			lastSeq: 0,
		});

		expect(debugEvents(dispatch, "runActivationSkipped")).toEqual([
			expect.objectContaining({
				chatId: "chat_1",
				runId: "run_1",
				agentKey: "demo",
				reason: "chat_mismatch",
				stateStreaming: false,
				pathname: "/agent/demo",
			}),
		]);
		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(0);
	});

	it("does not switch from a different idle chat before attaching", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/");
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: {
				current: createState({
					chatId: "chat_old",
					workerSelectionKey: "agent:demo",
				}),
			},
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			handledRunKeysRef: { current: new Set() },
		});

		dispatchRunStarted(MockCustomEvent, {
			chatId: "chat_new",
			runId: "run_new",
			agentKey: "demo",
		});

		expect(debugEvents(dispatch, "runActivationSkipped")).toEqual([
			expect.objectContaining({
				chatId: "chat_new",
				runId: "run_new",
				agentKey: "demo",
				reason: "chat_mismatch",
				stateChatId: "chat_old",
				stateStreaming: false,
				pathname: "/",
			}),
		]);
		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(0);
	});

	it("attaches a background new run for the active chat without clearing the current timeline", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/");
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: {
				current: createState({
					chatId: "chat_1",
					runId: "run_old",
					chats: [{ chatId: "chat_1", agentKey: "demo" } as Chat],
				}),
			},
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			handledRunKeysRef: { current: new Set() },
		});

		dispatchRunStarted(MockCustomEvent, {
			chatId: "chat_1",
			runId: "run_1",
			agentKey: "demo",
		});

		expect(dispatch).not.toHaveBeenCalledWith({
			type: "RESET_ACTIVE_CONVERSATION",
		});
		expect(dispatch).not.toHaveBeenCalledWith({ type: "SET_CHAT_ID", chatId: "chat_1" });
		expect(debugEvents(dispatch, "runActivationAttached")).toEqual([
			expect.objectContaining({
				chatId: "chat_1",
				runId: "run_1",
				agentKey: "demo",
				stateChatId: "chat_1",
				stateRunId: "run_old",
				stateStreaming: false,
			}),
		]);
		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(1);
	});

	it("attaches when only the UI streaming flag is stale", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/agent/demo");
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: {
				current: createState({
					chatId: "chat_1",
					runId: "run_old",
					streaming: true,
				}),
			},
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			handledRunKeysRef: { current: new Set() },
		});

		dispatchRunStarted(MockCustomEvent, {
			chatId: "chat_1",
			runId: "run_1",
			agentKey: "demo",
		});

		expect(debugEvents(dispatch, "runActivationAttached")).toEqual([
			expect.objectContaining({
				chatId: "chat_1",
				runId: "run_1",
				agentKey: "demo",
				reason: "stale_state_streaming_ignored",
				stateChatId: "chat_1",
				stateRunId: "run_old",
				stateStreaming: true,
			}),
		]);
		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(1);
	});

	it("ignores runs for a different main chat agent", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/agent/demo");
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: { current: createState() },
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			handledRunKeysRef: { current: new Set() },
		});

		dispatchRunStarted(MockCustomEvent, {
			chatId: "chat_1",
			runId: "run_1",
			agentKey: "other",
		});

		expect(debugEvents(dispatch, "runActivationSkipped")).toEqual([
			expect.objectContaining({
				chatId: "chat_1",
				runId: "run_1",
				agentKey: "other",
				reason: "chat_mismatch",
			}),
		]);
		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(0);
	});

	it("does not attach when an active query session is still streaming", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/");
		const session = createRunSession({
			requestId: "req_1",
			chatId: "chat_1",
			agentKey: "demo",
		});
		session.runId = "run_old";
		session.streaming = true;
		querySessionsRef.current.set("req_1", session);
		activeQuerySessionRequestIdRef.current = "req_1";
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: {
				current: createState({
					chatId: "chat_1",
					runId: "run_old",
				}),
			},
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			handledRunKeysRef: { current: new Set() },
		});

		dispatchRunStarted(MockCustomEvent, {
			chatId: "chat_1",
			runId: "run_1",
			agentKey: "demo",
		});

		expect(debugEvents(dispatch, "runActivationSkipped")).toEqual([
			expect.objectContaining({
				chatId: "chat_1",
				runId: "run_1",
				agentKey: "demo",
				reason: "active_session_streaming",
				activeRequestId: "req_1",
				activeSessionRunId: "run_old",
				activeSessionStreaming: true,
			}),
		]);
		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(0);
	});

	it("attaches when the active query session is an already-finished old run", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/");
		const session = createRunSession({
			requestId: "req_1",
			chatId: "chat_1",
			agentKey: "demo",
		});
		session.runId = "run_old";
		session.streaming = false;
		querySessionsRef.current.set("req_1", session);
		activeQuerySessionRequestIdRef.current = "req_1";
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: {
				current: createState({
					chatId: "chat_1",
					runId: "run_old",
				}),
			},
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			handledRunKeysRef: { current: new Set() },
		});

		dispatchRunStarted(MockCustomEvent, {
			chatId: "chat_1",
			runId: "run_new",
			agentKey: "demo",
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_CURRENT_CHAT_ACTIVE_RUN",
			activeRun: {
				chatId: "chat_1",
				runId: "run_new",
				agentKey: "demo",
				owner: { kind: "agent", agentKey: "demo" },
				lastSeq: 0,
			},
		});
		expect(debugEvents(dispatch, "runActivationAttached")).toEqual([
			expect.objectContaining({
				chatId: "chat_1",
				runId: "run_new",
				agentKey: "demo",
				activeRequestId: "req_1",
				activeSessionRunId: "run_old",
				activeSessionStreaming: false,
			}),
		]);
		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(1);
	});

	it("attaches an active Team chat without assigning a member agent", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/");
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: {
				current: createState({
					chatId: "chat_team",
					chats: [{
						chatId: "chat_team",
						teamId: "team_1",
						agentKey: "stale_member",
					} as Chat],
				}),
			},
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			handledRunKeysRef: { current: new Set() },
		});

		dispatchRunStarted(MockCustomEvent, {
			chatId: "chat_team",
			runId: "run_team",
			teamId: "team_1",
			agentKey: "member_a",
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_CURRENT_CHAT_ACTIVE_RUN",
			activeRun: {
				chatId: "chat_team",
				runId: "run_team",
				teamId: "team_1",
				owner: { kind: "orchestrated-team", teamId: "team_1" },
				lastSeq: 0,
			},
		});
		expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
			type: "SET_RUN_AGENT_BY_ID",
		}));
		const [attach] = eventDetails(mockWindow, "agent:attach-run") as Array<Record<string, unknown>>;
		expect(attach).toMatchObject({ chatId: "chat_team", runId: "run_team", teamId: "team_1" });
		expect(attach).not.toHaveProperty("agentKey");
	});

	it("attaches when the active query session ref is stale and missing", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/");
		activeQuerySessionRequestIdRef.current = "req_missing";
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: {
				current: createState({
					chatId: "chat_1",
					runId: "run_old",
				}),
			},
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			handledRunKeysRef: { current: new Set() },
		});

		dispatchRunStarted(MockCustomEvent, {
			chatId: "chat_1",
			runId: "run_new",
			agentKey: "demo",
		});

		expect(debugEvents(dispatch, "runActivationAttached")).toEqual([
			expect.objectContaining({
				chatId: "chat_1",
				runId: "run_new",
				agentKey: "demo",
				activeRequestId: "req_missing",
				activeSessionStreaming: false,
			}),
		]);
		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(1);
	});

	it("does not attach when a stored streaming session already observes the same run", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/");
		const session = createRunSession({
			requestId: "req_1",
			chatId: "chat_1",
			agentKey: "demo",
		});
		session.runId = "run_1";
		session.streaming = true;
		querySessionsRef.current.set("req_1", session);
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: {
				current: createState({
					chatId: "chat_1",
					runId: "run_old",
				}),
			},
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			handledRunKeysRef: { current: new Set() },
		});

		dispatchRunStarted(MockCustomEvent, {
			chatId: "chat_1",
			runId: "run_1",
			agentKey: "demo",
		});

		expect(debugEvents(dispatch, "runActivationSkipped")).toEqual([
			expect.objectContaining({
				chatId: "chat_1",
				runId: "run_1",
				agentKey: "demo",
				reason: "already_observing_new_run",
				activeSessionStreaming: false,
			}),
		]);
		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(0);
	});

	it("does not attach when the pushed run is already the current run", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/");
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: {
				current: createState({
					chatId: "chat_1",
					runId: "run_1",
				}),
			},
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			handledRunKeysRef: { current: new Set() },
		});

		dispatchRunStarted(MockCustomEvent, {
			chatId: "chat_1",
			runId: "run_1",
			agentKey: "demo",
		});

		expect(debugEvents(dispatch, "runActivationSkipped")).toEqual([
			expect.objectContaining({
				chatId: "chat_1",
				runId: "run_1",
				agentKey: "demo",
				reason: "same_run",
			}),
		]);
		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(0);
	});

	it("records debug when a candidate lacks attach identity", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/agent/demo");
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: { current: createState({ chatId: "chat_1" }) },
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			handledRunKeysRef: { current: new Set() },
		});

		dispatchRunStarted(MockCustomEvent, {
			chatId: "chat_1",
			runId: "run_1",
		});

		expect(debugEvents(dispatch, "runActivationSkipped")).toEqual([
			expect.objectContaining({
				chatId: "chat_1",
				runId: "run_1",
				reason: "missing_identity",
				stateChatId: "chat_1",
				pathname: "/agent/demo",
			}),
		]);
		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(0);
	});

	it("dedupes repeated run.started candidates for the same run", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/agent/demo");
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: { current: createState({ chatId: "chat_1", runId: "run_old" }) },
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			handledRunKeysRef: { current: new Set() },
		});

		const detail = {
			chatId: "chat_1",
			runId: "run_1",
			agentKey: "demo",
		};
		dispatchRunStarted(MockCustomEvent, detail);
		dispatchRunStarted(MockCustomEvent, detail);

		expect(debugEvents(dispatch, "runActivationSkipped")).toEqual([
			expect.objectContaining({
				chatId: "chat_1",
				runId: "run_1",
				agentKey: "demo",
				reason: "duplicate_push",
			}),
		]);
		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(1);
	});
});
