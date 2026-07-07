import type { AppAction } from "@/app/state/AppContext";
import type { AppState, Chat } from "@/app/state/types";
import {
	AGENT_RUN_STARTED_PUSH_EVENT,
	resolveMainChatRouteAgentKey,
	resolveMainChatRunActivation,
	resolveMainChatTargetAgentKey,
} from "@/features/chats/lib/mainChatRunActivation";
import { registerMainChatRunActivationListener } from "@/features/chats/hooks/useMainChatRunActivation";

function createState(overrides: Partial<AppState> = {}): AppState {
	return {
		chatId: "",
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

	it("rejects mismatched run.started candidates", () => {
		const decision = resolveMainChatRunActivation({
			state: createState({ workerSelectionKey: "agent:demo" }),
			pathname: "/",
			detail: {
				chatId: "chat_1",
				runId: "run_1",
				agentKey: "other",
			},
		});

		expect(decision).toEqual(
			expect.objectContaining({
				shouldActivate: false,
				reason: "agent_mismatch",
				targetAgentKey: "demo",
			}),
		);
	});
});

describe("registerMainChatRunActivationListener", () => {
	let dispatch: jest.Mock<void, [AppAction]>;

	beforeEach(() => {
		dispatch = jest.fn();
	});

	afterEach(() => {
		restoreWindow();
	});

	it("activates and attaches a same-agent run from an empty main chat", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/agent/demo");
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: { current: createState() },
			handledRunKeysRef: { current: new Set() },
		});

		dispatchRunStarted(MockCustomEvent, {
			chatId: "chat_1",
			runId: "run_1",
			agentKey: "demo",
			lastSeq: 0,
		});

		expect(dispatch).toHaveBeenCalledWith({ type: "SET_CHAT_ID", chatId: "chat_1" });
		expect(dispatch).toHaveBeenCalledWith({ type: "RESET_ACTIVE_CONVERSATION" });
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_CHAT_AGENT_BY_ID",
			chatId: "chat_1",
			agentKey: "demo",
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_RUN_AGENT_BY_ID",
			runId: "run_1",
			agentKey: "demo",
		});
		expect(dispatch).toHaveBeenCalledWith({ type: "SET_RUN_ID", runId: "run_1" });
		expect(eventDetails(mockWindow, "agent:reset-event-cache")).toHaveLength(1);
		expect(eventDetails(mockWindow, "agent:voice-reset")).toHaveLength(1);
		expect(eventDetails(mockWindow, "agent:attach-run")).toEqual([
			{
				chatId: "chat_1",
				runId: "run_1",
				agentKey: "demo",
				lastSeq: 0,
			},
		]);
	});

	it("switches from a different idle chat before attaching", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/");
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: {
				current: createState({
					chatId: "chat_old",
					workerSelectionKey: "agent:demo",
				}),
			},
			handledRunKeysRef: { current: new Set() },
		});

		dispatchRunStarted(MockCustomEvent, {
			chatId: "chat_new",
			runId: "run_new",
			agentKey: "demo",
		});

		expect(dispatch).toHaveBeenCalledWith({ type: "SET_CHAT_ID", chatId: "chat_new" });
		expect(dispatch).toHaveBeenCalledWith({ type: "RESET_ACTIVE_CONVERSATION" });
		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(1);
	});

	it("attaches the active chat without clearing the current timeline", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/");
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: {
				current: createState({
					chatId: "chat_1",
					chats: [{ chatId: "chat_1", agentKey: "demo" } as Chat],
				}),
			},
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
		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(1);
	});

	it("does not steal focus from a currently streaming run", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/agent/demo");
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: {
				current: createState({
					streaming: true,
				}),
			},
			handledRunKeysRef: { current: new Set() },
		});

		dispatchRunStarted(MockCustomEvent, {
			chatId: "chat_1",
			runId: "run_1",
			agentKey: "demo",
		});

		expect(dispatch).not.toHaveBeenCalled();
		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(0);
	});

	it("ignores runs for a different main chat agent", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/agent/demo");
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: { current: createState() },
			handledRunKeysRef: { current: new Set() },
		});

		dispatchRunStarted(MockCustomEvent, {
			chatId: "chat_1",
			runId: "run_1",
			agentKey: "other",
		});

		expect(dispatch).not.toHaveBeenCalled();
		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(0);
	});

	it("records debug when a candidate lacks attach identity", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/agent/demo");
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: { current: createState() },
			handledRunKeysRef: { current: new Set() },
		});

		dispatchRunStarted(MockCustomEvent, {
			chatId: "chat_1",
			runId: "run_1",
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "APPEND_DEBUG",
			line: "[main chat run] ignored run.started without attach identity (chatId=chat_1, runId=run_1, agentKey=-)",
		});
		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(0);
	});

	it("dedupes repeated run.started candidates for the same run", () => {
		const { mockWindow, MockCustomEvent } = setupMockWindow("/agent/demo");
		registerMainChatRunActivationListener({
			dispatch,
			stateRef: { current: createState() },
			handledRunKeysRef: { current: new Set() },
		});

		const detail = {
			chatId: "chat_1",
			runId: "run_1",
			agentKey: "demo",
		};
		dispatchRunStarted(MockCustomEvent, detail);
		dispatchRunStarted(MockCustomEvent, detail);

		expect(eventDetails(mockWindow, "agent:attach-run")).toHaveLength(1);
	});
});
