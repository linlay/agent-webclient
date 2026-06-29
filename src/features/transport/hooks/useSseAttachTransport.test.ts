import type { AppAction } from "@/app/state/AppContext";
import { createInitialState } from "@/app/state/state";
import type { AgentEvent, AppState } from "@/app/state/types";
import { registerSseAttachRunListener } from "@/features/transport/hooks/useSseAttachTransport";

class MockWindow {
	private listeners = new Map<string, Set<(event: Event) => void>>();
	location = {
		pathname: "/",
		search: "",
	};

	addEventListener(type: string, listener: (event: Event) => void): void {
		const current = this.listeners.get(type) || new Set<(event: Event) => void>();
		current.add(listener);
		this.listeners.set(type, current);
	}

	removeEventListener(type: string, listener: (event: Event) => void): void {
		this.listeners.get(type)?.delete(listener);
	}

	dispatchEvent(event: Event): boolean {
		for (const listener of this.listeners.get(event.type) || []) {
			listener(event);
		}
		return true;
	}
}

class MockCustomEvent {
	type: string;
	detail: Record<string, unknown>;

	constructor(type: string, init?: { detail?: Record<string, unknown> }) {
		this.type = type;
		this.detail = init?.detail || {};
	}
}

function createState(overrides: Partial<AppState> = {}): AppState {
	return {
		...createInitialState(),
		transportMode: "sse",
		...overrides,
	};
}

function createDeferred<T = void>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("registerSseAttachRunListener", () => {
	const originalWindow = (globalThis as { window?: unknown }).window;
	const originalCustomEvent = (globalThis as { CustomEvent?: unknown }).CustomEvent;
	const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
	const dispatch = jest.fn<void, [AppAction]>();
	const handleEvent = jest.fn<void, [AgentEvent]>();

	beforeEach(() => {
		dispatch.mockReset();
		handleEvent.mockReset();
		Object.defineProperty(globalThis, "window", {
			value: new MockWindow(),
			configurable: true,
			writable: true,
		});
		Object.defineProperty(globalThis, "CustomEvent", {
			value: MockCustomEvent,
			configurable: true,
			writable: true,
		});
		Object.defineProperty(globalThis, "localStorage", {
			value: {
				getItem: jest.fn(() => null),
				setItem: jest.fn(),
				removeItem: jest.fn(),
			},
			configurable: true,
			writable: true,
		});
	});

	afterEach(() => {
		if (originalWindow === undefined) {
			delete (globalThis as { window?: unknown }).window;
		} else {
			Object.defineProperty(globalThis, "window", {
				value: originalWindow,
				configurable: true,
				writable: true,
			});
		}
		if (originalCustomEvent === undefined) {
			delete (globalThis as { CustomEvent?: unknown }).CustomEvent;
		} else {
			Object.defineProperty(globalThis, "CustomEvent", {
				value: originalCustomEvent,
				configurable: true,
				writable: true,
			});
		}
		if (originalLocalStorage === undefined) {
			delete (globalThis as { localStorage?: unknown }).localStorage;
			return;
		}
		Object.defineProperty(globalThis, "localStorage", {
			value: originalLocalStorage,
			configurable: true,
			writable: true,
		});
	});

	it("attaches, dedupes, and clears state on completion", async () => {
		const deferred = createDeferred();
		const executeAttachRunSseImpl = jest.fn(() => deferred.promise);
		const activeAttachRef = { current: null as any };
		const querySessionsRef = { current: new Map() };
		const chatQuerySessionIndexRef = { current: new Map() };
		const activeQuerySessionRequestIdRef = { current: "" };
		const cleanup = registerSseAttachRunListener({
			dispatch,
			stateRef: { current: createState() },
			handleEvent,
			activeAttachRef,
			querySessionsRef,
			chatQuerySessionIndexRef,
			activeQuerySessionRequestIdRef,
			executeAttachRunSseImpl,
			createRequestIdImpl: () => "attach_1",
		});

		window.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha", lastSeq: 5 },
		}) as unknown as Event);
		window.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha", lastSeq: 5 },
		}) as unknown as Event);

		expect(executeAttachRunSseImpl).toHaveBeenCalledTimes(1);
		expect(executeAttachRunSseImpl).toHaveBeenCalledWith(expect.objectContaining({
			params: expect.objectContaining({
				runId: "run_1",
				agentKey: "agent_alpha",
				lastSeq: 5,
				signal: expect.any(AbortSignal),
			}),
		}));
		expect(dispatch).toHaveBeenCalledWith({ type: "SET_RUN_ID", runId: "run_1" });
		expect(dispatch).toHaveBeenCalledWith({ type: "SET_REQUEST_ID", requestId: "attach_1" });
		expect(dispatch).toHaveBeenCalledWith({ type: "SET_STREAMING", streaming: true });
		expect(querySessionsRef.current.get("attach_1")).toEqual(expect.objectContaining({
			requestId: "attach_1",
			chatId: "chat_1",
			runId: "run_1",
			streaming: true,
			abortController: expect.any(AbortController),
		}));
		expect(chatQuerySessionIndexRef.current.get("chat_1")).toBe("attach_1");
		expect(activeQuerySessionRequestIdRef.current).toBe("attach_1");

		deferred.resolve();
		await deferred.promise;
		await Promise.resolve();

		expect(dispatch).toHaveBeenCalledWith({ type: "SET_STREAMING", streaming: false });
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_ABORT_CONTROLLER",
			controller: null,
		});
		expect(querySessionsRef.current.get("attach_1")).toEqual(expect.objectContaining({
			streaming: false,
			abortController: null,
		}));
		expect(activeQuerySessionRequestIdRef.current).toBe("");

		cleanup();
	});

	it("resolves attach agentKey from run identity before attach detail and chat fallback", () => {
		const executeAttachRunSseImpl = jest.fn(() => new Promise<void>(() => undefined));
		const cleanup = registerSseAttachRunListener({
			dispatch,
			stateRef: {
				current: createState({
					chatAgentById: new Map([["chat_1", "agent_chat"]]),
					runAgentById: new Map([["run_1", "agent_run"]]),
					currentRunAgentKey: "agent_current",
				}),
			},
			handleEvent,
			activeAttachRef: { current: null },
			querySessionsRef: { current: new Map() },
			chatQuerySessionIndexRef: { current: new Map() },
			activeQuerySessionRequestIdRef: { current: "" },
			executeAttachRunSseImpl,
			createRequestIdImpl: () => "attach_1",
		});

		window.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_detail", lastSeq: 0 },
		}) as unknown as Event);

		expect(executeAttachRunSseImpl).toHaveBeenCalledWith(expect.objectContaining({
			params: expect.objectContaining({
				agentKey: "agent_run",
			}),
		}));
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_RUN_AGENT_BY_ID",
			runId: "run_1",
			agentKey: "agent_run",
		});

		cleanup();
	});

	it("renders request.query from attached streams", () => {
		let attachedOnEvent: ((event: AgentEvent) => void) | null = null;
		const executeAttachRunSseImpl = jest.fn((options) => {
			attachedOnEvent = options.handleEvent;
			return new Promise<void>(() => undefined);
		});
		const cleanup = registerSseAttachRunListener({
			dispatch,
			stateRef: { current: createState() },
			handleEvent,
			activeAttachRef: { current: null },
			querySessionsRef: { current: new Map() },
			chatQuerySessionIndexRef: { current: new Map() },
			activeQuerySessionRequestIdRef: { current: "" },
			executeAttachRunSseImpl,
			createRequestIdImpl: () => "attach_1",
		});

		window.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha", lastSeq: 0 },
		}) as unknown as Event);
		attachedOnEvent?.({
			type: "request.query",
			requestId: "req_1",
			query: "attached query",
			references: [{ name: "demo.txt", sizeBytes: 12 }],
			timestamp: 100,
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_TIMELINE_NODE",
			id: "user_req_1",
			node: expect.objectContaining({
				id: "user_req_1",
				kind: "message",
				role: "user",
				text: "attached query",
				attachments: [{ name: "demo.txt", size: 12 }],
			}),
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "APPEND_TIMELINE_ORDER",
			id: "user_req_1",
		});
		expect(handleEvent).toHaveBeenCalledWith(expect.objectContaining({
			type: "request.query",
			query: "attached query",
		}));

		cleanup();
	});

	it("aborts the previous attach before starting a new one", () => {
		const abortSignals: AbortSignal[] = [];
		const executeAttachRunSseImpl = jest.fn((options) => {
			abortSignals.push(options.params.signal as AbortSignal);
			return new Promise<void>(() => undefined);
		});
		const cleanup = registerSseAttachRunListener({
			dispatch,
			stateRef: { current: createState() },
			handleEvent,
			activeAttachRef: { current: null },
			querySessionsRef: { current: new Map() },
			chatQuerySessionIndexRef: { current: new Map() },
			activeQuerySessionRequestIdRef: { current: "" },
			executeAttachRunSseImpl,
			createRequestIdImpl: jest
				.fn()
				.mockReturnValueOnce("attach_1")
				.mockReturnValueOnce("attach_2"),
		});

		window.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha", lastSeq: 0 },
		}) as unknown as Event);
		window.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_2", agentKey: "agent_alpha", lastSeq: 0 },
		}) as unknown as Event);

		expect(executeAttachRunSseImpl).toHaveBeenCalledTimes(2);
		expect(abortSignals[0].aborted).toBe(true);
		expect(abortSignals[1].aborted).toBe(false);

		cleanup();
	});

	it("clears streaming state on terminal run events", () => {
		let attachedOnEvent: ((event: AgentEvent) => void) | null = null;
		const executeAttachRunSseImpl = jest.fn((options) => {
			attachedOnEvent = options.handleEvent;
			return new Promise<void>(() => undefined);
		});
		const activeQuerySessionRequestIdRef = { current: "" };
		const cleanup = registerSseAttachRunListener({
			dispatch,
			stateRef: { current: createState() },
			handleEvent,
			activeAttachRef: { current: null },
			querySessionsRef: { current: new Map() },
			chatQuerySessionIndexRef: { current: new Map() },
			activeQuerySessionRequestIdRef,
			executeAttachRunSseImpl,
			createRequestIdImpl: () => "attach_1",
		});

		window.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha", lastSeq: 0 },
		}) as unknown as Event);
		attachedOnEvent?.({
			type: "run.complete",
			chatId: "chat_1",
			runId: "run_1",
		});

		expect(dispatch).toHaveBeenCalledWith({ type: "SET_STREAMING", streaming: false });
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_ABORT_CONTROLLER",
			controller: null,
		});
		expect(activeQuerySessionRequestIdRef.current).toBe("");

		cleanup();
	});
});
