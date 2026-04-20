import type { AppAction } from "@/app/state/AppContext";
import type { AppState, AgentEvent } from "@/app/state/types";
import { connectWsTransport, registerAttachRunListener } from "@/features/transport/hooks/useWsTransport";

function createState(overrides: Partial<AppState> = {}): AppState {
	return {
		agents: [],
		teams: [],
		chats: [],
		sidebarPendingRequestCount: 0,
		chatAgentById: new Map(),
		pendingNewChatAgentKey: "",
		workerPriorityKey: "",
		chatId: "",
		runId: "",
		requestId: "",
		streaming: false,
		abortController: null,
		messagesById: new Map(),
		messageOrder: [],
		events: [],
		debugLines: [],
		rawSseEntries: [],
		artifacts: [],
		plan: null,
		planRuntimeByTaskId: new Map(),
		taskItemsById: new Map(),
		taskGroupsById: new Map(),
		planCurrentRunningTaskId: "",
		planLastTouchedTaskId: "",
		toolStates: new Map(),
		toolNodeById: new Map(),
		contentNodeById: new Map(),
		pendingTools: new Map(),
		reasoningNodeById: new Map(),
		reasoningCollapseTimers: new Map(),
		actionStates: new Map(),
		executedActionIds: new Set(),
		timelineNodes: new Map(),
		timelineOrder: [],
		timelineNodeByMessageId: new Map(),
		timelineDomCache: new Map(),
		timelineCounter: 0,
		renderQueue: {
			dirtyNodeIds: new Set(),
			scheduled: false,
			stickToBottomRequested: false,
			fullSyncNeeded: false,
		},
		activeReasoningKey: "",
		chatFilter: "",
		conversationMode: "worker",
		workerSelectionKey: "",
		workerRows: [],
		workerIndexByKey: new Map(),
		workerRelatedChats: [],
		workerChatPanelCollapsed: true,
		chatLoadSeq: 0,
		settingsOpen: false,
		leftDrawerOpen: false,
		rightDrawerOpen: false,
		desktopDebugSidebarEnabled: false,
		attachmentPreview: null,
		layoutMode: "mobile-drawer",
		artifactExpanded: false,
		artifactManualOverride: null,
		artifactAutoCollapseTimer: null,
		planExpanded: false,
		planManualOverride: null,
		planAutoCollapseTimer: null,
		mentionOpen: false,
		mentionSuggestions: [],
		mentionActiveIndex: 0,
		activeFrontendTool: null,
		activeAwaiting: null,
		themeMode: "system",
		transportMode: "ws",
		wsStatus: "disconnected",
		wsErrorMessage: "",
		accessToken: "",
		audioMuted: false,
		ttsDebugStatus: "idle",
		planningMode: false,
		inputMode: "text",
		voiceChat: {
			status: "idle",
			sessionActive: false,
			partialUserText: "",
			partialAssistantText: "",
			activeAssistantContentId: "",
			activeRequestId: "",
			activeTtsTaskId: "",
			ttsCommitted: false,
			error: "",
			wsStatus: "idle",
			capabilities: null,
			capabilitiesLoaded: false,
			capabilitiesError: "",
			voices: [],
			voicesLoaded: false,
			voicesError: "",
			selectedVoice: "",
			speechRate: 1.2,
			clientGate: {
				enabled: true,
				rmsThreshold: 0.015,
				openHoldMs: 120,
				closeHoldMs: 480,
				preRollMs: 240,
			},
			clientGateCustomized: false,
			currentAgentKey: "",
			currentAgentName: "",
		},
		steerDraft: "",
		pendingSteers: [],
		downvotedRunKeys: new Set(),
		eventPopoverIndex: -1,
		eventPopoverEventRef: null,
		eventPopoverAnchor: null,
		commandStatusOverlay: {
			visible: false,
			commandType: null,
			phase: "success",
			text: "",
			timer: null,
		},
		commandModal: {
			open: false,
			type: null,
			searchText: "",
			historySearch: "",
			activeIndex: 0,
			scope: "all",
			focusArea: "search",
			scheduleTask: "",
			scheduleRule: "",
		},
		...overrides,
	};
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("connectWsTransport", () => {
	const handleEvent = jest.fn<void, [AgentEvent]>();
	const dispatch = jest.fn<void, [AppAction]>();
	const originalWindow = (globalThis as { window?: unknown }).window;
	const originalCustomEvent = (globalThis as { CustomEvent?: unknown }).CustomEvent;

	function createConnectedWsClient(
		initWsClientImpl = jest.fn(),
	): {
		initWsClientImpl: jest.Mock;
		connect: jest.Mock<Promise<void>, []>;
		getOnPush: () => ((frame: Record<string, unknown>) => void) | undefined;
	} {
		const connect = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
		initWsClientImpl.mockImplementation((options) => ({ connect, options }) as any);
		return {
			initWsClientImpl,
			connect,
			getOnPush: () => initWsClientImpl.mock.calls[0]?.[0]?.onPush,
		};
	}

	beforeEach(() => {
		dispatch.mockReset();
		handleEvent.mockReset();
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
			return;
		}
		Object.defineProperty(globalThis, "CustomEvent", {
			value: originalCustomEvent,
			configurable: true,
			writable: true,
		});
	});

	it("waits for app-mode token hydration before creating the ws client", async () => {
		const tokenDeferred = createDeferred<string>();
		const connect = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
		const initWsClientImpl = jest.fn(() => ({ connect }) as any);
		const state = createState({ accessToken: "" });
		const stateRef = { current: state };

		const pending = connectWsTransport({
			dispatch,
			state,
			stateRef,
			handleEvent,
			isAppModeImpl: () => true,
			ensureAccessTokenImpl: jest.fn(() => tokenDeferred.promise),
			initWsClientImpl,
			destroyWsClientImpl: jest.fn(),
		});

		await Promise.resolve();
		expect(initWsClientImpl).not.toHaveBeenCalled();

		tokenDeferred.resolve("token_1");
		await pending;

		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_ACCESS_TOKEN",
			token: "token_1",
		});
		expect(initWsClientImpl).toHaveBeenCalledWith(
			expect.objectContaining({ accessToken: "token_1" }),
		);
		expect(connect).toHaveBeenCalledTimes(1);
	});

	it("skips query ws connect when no token is available", async () => {
		const initWsClientImpl = jest.fn();
		const destroyWsClientImpl = jest.fn();
		const state = createState({ accessToken: "" });

		await expect(
			connectWsTransport({
				dispatch,
				state,
				stateRef: { current: state },
				handleEvent,
				isAppModeImpl: () => true,
				ensureAccessTokenImpl: jest.fn().mockResolvedValue(""),
				initWsClientImpl,
				destroyWsClientImpl,
			}),
		).rejects.toThrow(
			"缺少 Access Token，无法建立 WebSocket 连接。请确认宿主应用已提供有效令牌。",
		);

		expect(initWsClientImpl).not.toHaveBeenCalled();
		expect(destroyWsClientImpl).toHaveBeenCalledTimes(1);
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_WS_ERROR_MESSAGE",
			message:
				"缺少 Access Token，无法建立 WebSocket 连接。请确认宿主应用已提供有效令牌。",
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_WS_STATUS",
			status: "disconnected",
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "APPEND_DEBUG",
			line:
				"[live] 缺少 Access Token，无法建立 WebSocket 连接。请确认宿主应用已提供有效令牌。",
		});
	});

	it("records a standalone-page handshake failure without app-mode token refresh", async () => {
		const connect = jest
			.fn<Promise<void>, []>()
			.mockRejectedValue(new Error("WebSocket connection failed"));
		const initWsClientImpl = jest.fn(() => ({ connect }) as any);
		const ensureAccessTokenImpl = jest.fn();
		const state = createState({ accessToken: "token_local" });

		await expect(
			connectWsTransport({
				dispatch,
				state,
				stateRef: { current: state },
				handleEvent,
				isAppModeImpl: () => false,
				ensureAccessTokenImpl,
				initWsClientImpl,
				destroyWsClientImpl: jest.fn(),
			}),
		).rejects.toThrow(
			"WebSocket 握手失败，请检查 Access Token 是否有效，并确认后端已启用 /ws。",
		);

		expect(ensureAccessTokenImpl).not.toHaveBeenCalled();
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_WS_ERROR_MESSAGE",
			message:
				"WebSocket 握手失败，请检查 Access Token 是否有效，并确认后端已启用 /ws。",
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_WS_STATUS",
			status: "error",
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "APPEND_DEBUG",
			line:
				"[live] WebSocket 握手失败，请检查 Access Token 是否有效，并确认后端已启用 /ws。",
		});
	});

	it("retries once with a refreshed app-mode token after connect failure", async () => {
		const firstConnect = jest
			.fn<Promise<void>, []>()
			.mockRejectedValue(new Error("WebSocket connection failed"));
		const secondConnect = jest
			.fn<Promise<void>, []>()
			.mockResolvedValue(undefined);
		const initWsClientImpl = jest
			.fn()
			.mockReturnValueOnce({ connect: firstConnect } as any)
			.mockReturnValueOnce({ connect: secondConnect } as any);
		const destroyWsClientImpl = jest.fn();
		const ensureAccessTokenImpl = jest
			.fn()
			.mockResolvedValueOnce("token_a")
			.mockResolvedValueOnce("token_b");
		const state = createState({ accessToken: "" });
		const stateRef = { current: state };

		await connectWsTransport({
			dispatch,
			state,
			stateRef,
			handleEvent,
			isAppModeImpl: () => true,
			ensureAccessTokenImpl,
			initWsClientImpl,
			destroyWsClientImpl,
		});

		expect(ensureAccessTokenImpl).toHaveBeenNthCalledWith(1, "missing");
		expect(ensureAccessTokenImpl).toHaveBeenNthCalledWith(2, "unauthorized");
		expect(initWsClientImpl).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ accessToken: "token_a" }),
		);
		expect(initWsClientImpl).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ accessToken: "token_b" }),
		);
		expect(destroyWsClientImpl).toHaveBeenCalledTimes(1);
		expect(dispatch).toHaveBeenCalledWith({
			type: "APPEND_DEBUG",
			line: "[live] Query WebSocket connect failed, retrying after token refresh",
		});
		expect(secondConnect).toHaveBeenCalledTimes(1);
	});

	it("upserts chat.created for a different chat via websocket push", async () => {
		const { initWsClientImpl, getOnPush } = createConnectedWsClient();
		const state = createState({ accessToken: "token_local", chatId: "chat_active" });

		await connectWsTransport({
			dispatch,
			state,
			stateRef: { current: state },
			handleEvent,
			isAppModeImpl: () => false,
			ensureAccessTokenImpl: jest.fn(),
			initWsClientImpl,
			destroyWsClientImpl: jest.fn(),
		});

		getOnPush()?.({
			frame: "push",
			type: "chat.created",
			payload: {
				chatId: "chat_new",
				chatName: "New Chat",
				agentKey: "agent_alpha",
			},
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_new",
				chatName: "New Chat",
				agentKey: "agent_alpha",
				firstAgentKey: "agent_alpha",
			}),
		});
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("upserts chat.created when the backend sends nested data instead of payload", async () => {
		const { initWsClientImpl, getOnPush } = createConnectedWsClient();
		const state = createState({ accessToken: "token_local", chatId: "chat_active" });

		await connectWsTransport({
			dispatch,
			state,
			stateRef: { current: state },
			handleEvent,
			isAppModeImpl: () => false,
			ensureAccessTokenImpl: jest.fn(),
			initWsClientImpl,
			destroyWsClientImpl: jest.fn(),
		});

		getOnPush()?.({
			frame: "push",
			type: "chat.created",
			data: {
				chatId: "chat_from_data",
				chatName: "Chat From Data",
				agentKey: "agent_data",
			},
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_from_data",
				chatName: "Chat From Data",
				agentKey: "agent_data",
				firstAgentKey: "agent_data",
			}),
		});
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("upserts run.started for another chat without dropping it on the current-chat filter", async () => {
		const { initWsClientImpl, getOnPush } = createConnectedWsClient();
		const state = createState({ accessToken: "token_local", chatId: "chat_active" });

		await connectWsTransport({
			dispatch,
			state,
			stateRef: { current: state },
			handleEvent,
			isAppModeImpl: () => false,
			ensureAccessTokenImpl: jest.fn(),
			initWsClientImpl,
			destroyWsClientImpl: jest.fn(),
		});

		getOnPush()?.({
			frame: "push",
			type: "run.started",
			payload: {
				chatId: "chat_remote",
				runId: "run_remote",
				agentKey: "agent_remote",
			},
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_remote",
				lastRunId: "run_remote",
				agentKey: "agent_remote",
				firstAgentKey: "agent_remote",
			}),
		});
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("dispatches agent:attach-run for run.started on the active chat", async () => {
		const { initWsClientImpl, getOnPush } = createConnectedWsClient();
		const state = createState({ accessToken: "token_local", chatId: "chat_active" });
		const dispatchEvent = jest.fn();
		class MockCustomEvent {
			type: string;
			detail: { chatId: string; runId: string; lastSeq: number };

			constructor(type: string, init?: { detail?: { chatId: string; runId: string; lastSeq: number } }) {
				this.type = type;
				this.detail = init?.detail || { chatId: "", runId: "", lastSeq: 0 };
			}
		}
		Object.defineProperty(globalThis, "window", {
			value: { dispatchEvent },
			configurable: true,
			writable: true,
		});
		Object.defineProperty(globalThis, "CustomEvent", {
			value: MockCustomEvent,
			configurable: true,
			writable: true,
		});

		await connectWsTransport({
			dispatch,
			state,
			stateRef: { current: state },
			handleEvent,
			isAppModeImpl: () => false,
			ensureAccessTokenImpl: jest.fn(),
			initWsClientImpl,
			destroyWsClientImpl: jest.fn(),
		});

		getOnPush()?.({
			frame: "push",
			type: "run.started",
			payload: {
				chatId: "chat_active",
				runId: "run_active",
			},
		});

		expect(dispatchEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "agent:attach-run",
				detail: {
					chatId: "chat_active",
					runId: "run_active",
					lastSeq: 0,
				},
			}),
		);
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("registerAttachRunListener attaches, dedupes, and clears state on completion", () => {
		class MockWindow {
			private listeners = new Map<string, Set<(event: Event) => void>>();

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

		const mockWindow = new MockWindow();
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

		const attaches: Array<{
			requestId: string;
			abort: jest.Mock;
			onDone: (reason: string, lastSeq: number) => void;
		}> = [];
		const attachRun = jest.fn(
			(
				runId: string,
				lastSeq: number,
				_onEvent: (event: AgentEvent) => void,
				onDone?: (reason: string, lastSeq: number) => void,
			) => {
				const entry = {
					requestId: `attach_${attaches.length + 1}`,
					abort: jest.fn(() => onDone?.("detached", 0)),
					onDone: onDone || (() => undefined),
				};
				attaches.push(entry);
				return entry;
			},
		);
		const activeAttachRef = { current: null as any };
		const cleanup = registerAttachRunListener({
			dispatch,
			stateRef: { current: createState({ transportMode: "ws" }) },
			handleEvent,
			activeAttachRef,
			getWsClientImpl: () => ({ attachRun }) as any,
		});

		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", lastSeq: 0 },
		}) as unknown as Event);
		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", lastSeq: 0 },
		}) as unknown as Event);

		expect(attachRun).toHaveBeenCalledTimes(1);
		expect(dispatch).toHaveBeenCalledWith({ type: "SET_RUN_ID", runId: "run_1" });
		expect(dispatch).toHaveBeenCalledWith({ type: "SET_STREAMING", streaming: true });
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_ABORT_CONTROLLER",
			controller: expect.any(AbortController),
		});

		attaches[0].onDone("done", 9);

		expect(dispatch).toHaveBeenCalledWith({ type: "SET_STREAMING", streaming: false });
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_ABORT_CONTROLLER",
			controller: null,
		});

		cleanup();
	});

	it("registerAttachRunListener aborts the previous attach before starting a new one", () => {
		class MockWindow {
			private listeners = new Map<string, Set<(event: Event) => void>>();

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

		const mockWindow = new MockWindow();
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

		const attaches: Array<{ abort: jest.Mock }> = [];
		const attachRun = jest.fn(
			(
				_runId: string,
				_lastSeq: number,
				_onEvent: (event: AgentEvent) => void,
				onDone?: (reason: string, lastSeq: number) => void,
			) => {
				const entry = {
					requestId: `attach_${attaches.length + 1}`,
					abort: jest.fn(() => onDone?.("detached", 0)),
				};
				attaches.push(entry);
				return entry;
			},
		);
		const activeAttachRef = { current: null as any };
		const cleanup = registerAttachRunListener({
			dispatch,
			stateRef: { current: createState({ transportMode: "ws" }) },
			handleEvent,
			activeAttachRef,
			getWsClientImpl: () => ({ attachRun }) as any,
		});

		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", lastSeq: 0 },
		}) as unknown as Event);
		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_2", lastSeq: 0 },
		}) as unknown as Event);

		expect(attaches).toHaveLength(2);
		expect(attaches[0].abort).toHaveBeenCalledTimes(1);

		cleanup();
	});

	it("forwards chat.updated with push-frame metadata for the active chat", async () => {
		const { initWsClientImpl, getOnPush } = createConnectedWsClient();
		const state = createState({ accessToken: "token_local", chatId: "chat_active" });

		await connectWsTransport({
			dispatch,
			state,
			stateRef: { current: state },
			handleEvent,
			isAppModeImpl: () => false,
			ensureAccessTokenImpl: jest.fn(),
			initWsClientImpl,
			destroyWsClientImpl: jest.fn(),
		});

		getOnPush()?.({
			frame: "push",
			type: "chat.updated",
			payload: {
				chatId: "chat_active",
				lastRunContent: "updated elsewhere",
			},
		});

		expect(handleEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "chat.updated",
				chatId: "chat_active",
				lastRunContent: "updated elsewhere",
			}),
		);
	});

	it("upserts run.finished for any chat and reloads the active chat when idle", async () => {
		const { initWsClientImpl, getOnPush } = createConnectedWsClient();
		const state = createState({ accessToken: "token_local", chatId: "chat_active" });
		const dispatchEvent = jest.fn();
		class MockCustomEvent {
			type: string;
			detail: { chatId: string };

			constructor(type: string, init?: { detail?: { chatId: string } }) {
				this.type = type;
				this.detail = init?.detail || { chatId: "" };
			}
		}
		Object.defineProperty(globalThis, "window", {
			value: { dispatchEvent },
			configurable: true,
			writable: true,
		});
		Object.defineProperty(globalThis, "CustomEvent", {
			value: MockCustomEvent,
			configurable: true,
			writable: true,
		});

		await connectWsTransport({
			dispatch,
			state,
			stateRef: { current: state },
			handleEvent,
			isAppModeImpl: () => false,
			ensureAccessTokenImpl: jest.fn(),
			initWsClientImpl,
			destroyWsClientImpl: jest.fn(),
		});

		getOnPush()?.({
			frame: "push",
			type: "run.finished",
			payload: {
				chatId: "chat_active",
				runId: "run_done",
			},
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_active",
				lastRunId: "run_done",
			}),
		});
		expect(dispatchEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "agent:load-chat",
				detail: { chatId: "chat_active" },
			}),
		);
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("prefers top-level push fields over payload fields when both are present", async () => {
		const { initWsClientImpl, getOnPush } = createConnectedWsClient();
		const state = createState({ accessToken: "token_local" });

		await connectWsTransport({
			dispatch,
			state,
			stateRef: { current: state },
			handleEvent,
			isAppModeImpl: () => false,
			ensureAccessTokenImpl: jest.fn(),
			initWsClientImpl,
			destroyWsClientImpl: jest.fn(),
		});

		getOnPush()?.({
			frame: "push",
			type: "run.started",
			chatId: "chat_top",
			runId: "run_top",
			payload: {
				chatId: "chat_payload",
				runId: "run_payload",
			},
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_top",
				lastRunId: "run_top",
			}),
		});
	});

	it("prefers top-level push fields over nested data fields when both are present", async () => {
		const { initWsClientImpl, getOnPush } = createConnectedWsClient();
		const state = createState({ accessToken: "token_local" });

		await connectWsTransport({
			dispatch,
			state,
			stateRef: { current: state },
			handleEvent,
			isAppModeImpl: () => false,
			ensureAccessTokenImpl: jest.fn(),
			initWsClientImpl,
			destroyWsClientImpl: jest.fn(),
		});

		getOnPush()?.({
			frame: "push",
			type: "chat.created",
			chatId: "chat_top_data",
			chatName: "Top Level Name",
			data: {
				chatId: "chat_nested_data",
				chatName: "Nested Name",
				agentKey: "agent_nested",
			},
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_top_data",
				chatName: "Top Level Name",
				agentKey: "agent_nested",
				firstAgentKey: "agent_nested",
			}),
		});
	});
});
