import type { AppAction } from "@/app/state/AppContext";
import type { AppState, AgentEvent } from "@/app/state/types";
import { connectWsTransport, registerAttachRunListener, registerDetachRunListener } from "@/features/transport/hooks/useWsTransport";
import { WS_STREAM_RETRY_DELAYS_MS } from "@/features/transport/lib/wsStreamReplay";

function createState(overrides: Partial<AppState> = {}): AppState {
	return {
		agents: [],
		teams: [],
		chats: [],
		automations: [],
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
		archiveOpen: false,
		leftDrawerOpen: false,
		rightSidebarOpen: false,
		rightSidebarOpenTab: null,
		rightSidebarOpenSeq: 0,
		attachmentPreview: null,
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
			automationTask: "",
			automationRule: "",
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
		).rejects.toThrow(/(Missing access token|缺少 Access Token)/i);

		expect(initWsClientImpl).not.toHaveBeenCalled();
		expect(destroyWsClientImpl).toHaveBeenCalledTimes(1);
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_WS_ERROR_MESSAGE",
			message: expect.stringMatching(/(Missing access token|缺少 Access Token)/i),
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_WS_STATUS",
			status: "disconnected",
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "APPEND_DEBUG",
			line: expect.stringMatching(/\[live\].*(Missing access token|缺少 Access Token)/i),
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
		).rejects.toThrow(/WebSocket .*?(handshake failed|握手失败)/i);

		expect(ensureAccessTokenImpl).not.toHaveBeenCalled();
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_WS_ERROR_MESSAGE",
			message: expect.stringMatching(/WebSocket .*?(handshake failed|握手失败)/i),
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_WS_STATUS",
			status: "error",
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "APPEND_DEBUG",
			line: expect.stringMatching(/\[live\].*WebSocket .*?(handshake failed|握手失败)/i),
		});
	});

	it("records a disconnected websocket transport without calling it a handshake failure", async () => {
		const connect = jest
			.fn<Promise<void>, []>()
			.mockRejectedValue(new Error("WebSocket transport disconnected"));
		const initWsClientImpl = jest.fn(() => ({ connect }) as any);
		const state = createState({ accessToken: "token_local" });

		await expect(
			connectWsTransport({
				dispatch,
				state,
				stateRef: { current: state },
				handleEvent,
				isAppModeImpl: () => false,
				ensureAccessTokenImpl: jest.fn(),
				initWsClientImpl,
				destroyWsClientImpl: jest.fn(),
			}),
		).rejects.toThrow(/WebSocket .*?(disconnected|连接已断开)/i);

		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_WS_ERROR_MESSAGE",
			message: expect.stringMatching(/WebSocket .*?(disconnected|连接已断开)/i),
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

	it("removes and resets the active chat when chat.archived arrives over push", async () => {
		const { initWsClientImpl, getOnPush } = createConnectedWsClient();
		const state = createState({ accessToken: "token_local", chatId: "chat_active" });
		const dispatchEvent = jest.fn();
		class MockCustomEvent {
			type: string;
			detail: unknown;

			constructor(type: string, init?: { detail?: unknown }) {
				this.type = type;
				this.detail = init?.detail;
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
			type: "chat.archived",
			payload: {
				chatId: "chat_active",
			},
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "CHAT_ARCHIVED",
			chatId: "chat_active",
		});
		expect(dispatch).toHaveBeenCalledWith({ type: "SET_CHAT_ID", chatId: "" });
		expect(dispatch).toHaveBeenCalledWith({ type: "SET_RUN_ID", runId: "" });
		expect(dispatch).toHaveBeenCalledWith({ type: "RESET_ACTIVE_CONVERSATION" });
		expect(dispatchEvent).toHaveBeenCalledWith(
			expect.objectContaining({ type: "agent:reset-event-cache" }),
		);
		expect(dispatchEvent).toHaveBeenCalledWith(
			expect.objectContaining({ type: "agent:voice-reset" }),
		);
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("forwards catalog.updated push events to the registry console window listener", async () => {
		const { initWsClientImpl, getOnPush } = createConnectedWsClient();
		const state = createState({ accessToken: "token_local", chatId: "chat_active" });
		const dispatchEvent = jest.fn();
		class MockCustomEvent {
			type: string;
			detail: unknown;

			constructor(type: string, init?: { detail?: unknown }) {
				this.type = type;
				this.detail = init?.detail;
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
			type: "catalog.updated",
			payload: {
				reason: "models",
			},
		});

		expect(dispatchEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "agent:catalog-updated",
				detail: expect.objectContaining({ type: "catalog.updated", reason: "models" }),
			}),
		);
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

	it("upserts awaiting.asking for another chat and keeps it out of the active timeline", async () => {
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
			type: "awaiting.asking",
			payload: {
				chatId: "chat_remote",
				runId: "run_remote",
				awaitingId: "await_1",
				createdAt: 1776830869957,
			},
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_remote",
				lastRunId: "run_remote",
				hasPendingAwaiting: true,
				updatedAt: 1776830869957,
			}),
		});
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("upserts awaiting.asking push data into pending awaiting chat state", async () => {
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
			type: "awaiting.asking",
			data: {
				agentKey: "askUser.demo",
				awaitingId: "call_function_enm773pg95p1_1",
				chatId: "chat_remote",
				createdAt: 1780737509785,
				mode: "question",
				runId: "mq254p8r",
				timeout: 600000,
				viewportKey: "question",
				viewportType: "builtin",
			},
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_remote",
				lastRunId: "mq254p8r",
				hasPendingAwaiting: true,
				awaiting: { mode: "question" },
				updatedAt: 1780737509785,
			}),
		});
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("dispatches agent:attach-run for active awaiting.asking push events", async () => {
		const { initWsClientImpl, getOnPush } = createConnectedWsClient();
		const state = createState({ accessToken: "token_local", chatId: "chat_active" });
		const dispatchEvent = jest.fn();
		class MockCustomEvent {
			type: string;
			detail: { chatId: string; runId: string; agentKey: string; lastSeq: number };

			constructor(type: string, init?: { detail?: { chatId: string; runId: string; agentKey?: string; lastSeq: number } }) {
				this.type = type;
				this.detail = { chatId: "", runId: "", agentKey: "", lastSeq: 0, ...(init?.detail || {}) };
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
			type: "awaiting.asking",
			data: {
				agentKey: "agent_active",
				awaitingId: "await_active",
				chatId: "chat_active",
				createdAt: 1780737509785,
				mode: "question",
				runId: "run_active",
			},
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_active",
				lastRunId: "run_active",
				hasPendingAwaiting: true,
				awaiting: { mode: "question" },
				updatedAt: 1780737509785,
			}),
		});
		expect(dispatchEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "agent:attach-run",
				detail: {
					chatId: "chat_active",
					runId: "run_active",
					agentKey: "agent_active",
					lastSeq: 0,
				},
			}),
		);
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("clears pending awaiting state when awaiting.answered arrives over push", async () => {
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
			type: "awaiting.answered",
			payload: {
				chatId: "chat_remote",
				runId: "run_remote",
				awaitingId: "await_1",
			},
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_remote",
				lastRunId: "run_remote",
				hasPendingAwaiting: false,
			}),
		});
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("dispatches agent:attach-run for active awaiting.answered push events", async () => {
		const { initWsClientImpl, getOnPush } = createConnectedWsClient();
		const state = createState({ accessToken: "token_local", chatId: "chat_active" });
		const dispatchEvent = jest.fn();
		class MockCustomEvent {
			type: string;
			detail: { chatId: string; runId: string; agentKey: string; lastSeq: number };

			constructor(type: string, init?: { detail?: { chatId: string; runId: string; agentKey?: string; lastSeq: number } }) {
				this.type = type;
				this.detail = { chatId: "", runId: "", agentKey: "", lastSeq: 0, ...(init?.detail || {}) };
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
			type: "awaiting.answered",
			payload: {
				chatId: "chat_active",
				runId: "run_active_v2",
				agentKey: "agent_active",
				agentUnreadCount: 0,
			},
		});

		expect(dispatchEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "agent:attach-run",
				detail: {
					chatId: "chat_active",
					runId: "run_active_v2",
					agentKey: "agent_active",
					lastSeq: 0,
				},
			}),
		);
	});
});

function setupMockWindow(): {
	mockWindow: {
		addEventListener: (
			type: string,
			listener: (event: Event) => void,
		) => void;
		removeEventListener: (
			type: string,
			listener: (event: Event) => void,
		) => void;
		dispatchEvent: (event: Event) => boolean;
	};
	MockCustomEvent: new (...args: any[]) => any;
} {
	const listeners = new Map<string, Set<(event: Event) => void>>();
	const mockWindow = {
		addEventListener: (type: string, listener: (event: Event) => void) => {
			const current = listeners.get(type) || new Set();
			current.add(listener);
			listeners.set(type, current);
		},
		removeEventListener: (type: string, listener: (event: Event) => void) => {
			listeners.get(type)?.delete(listener);
		},
		dispatchEvent: (event: Event): boolean => {
			for (const listener of listeners.get(event.type) || []) {
				listener(event);
			}
			return true;
		},
	};
	class MockCustomEvent {
		type: string;
		detail: any;
		constructor(type: string, init?: { detail?: any }) {
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
	delete (globalThis as any).window;
	delete (globalThis as any).CustomEvent;
}

describe("registerDetachRunListener", () => {
	const dispatch = jest.fn();
	let mockWindow: ReturnType<typeof setupMockWindow>["mockWindow"];
	let MockCustomEvent: ReturnType<typeof setupMockWindow>["MockCustomEvent"];

	beforeEach(() => {
		dispatch.mockReset();
		const setup = setupMockWindow();
		mockWindow = setup.mockWindow;
		MockCustomEvent = setup.MockCustomEvent;
	});

	afterEach(() => {
		restoreWindow();
	});

	it("sends /api/detach over ws for agent:detach-run events", () => {
		const requestMock = jest.fn().mockResolvedValue({
			data: { accepted: true, status: "detached" },
		});
		const state = createState({
			chatId: "chat_1",
			runId: "run_1",
			runAgentById: new Map([["run_1", "agent_alpha"]]),
		});
		const cleanup = registerDetachRunListener({
			dispatch,
			stateRef: { current: state },
			querySessionsRef: { current: new Map() },
			activeQuerySessionRequestIdRef: { current: "" },
			getWsClientImpl: () => ({ request: requestMock }) as any,
			logMissing: true,
		});

		mockWindow.dispatchEvent(new MockCustomEvent("agent:detach-run", {
			detail: { chatId: "chat_1", runId: "run_1", reason: "chat_switch" },
		}));

		expect(requestMock).toHaveBeenCalledWith({
			type: "/api/detach",
			payload: {
				runId: "run_1",
				agentKey: "agent_alpha",
				reason: "chat_switch",
			},
		});

		cleanup();
	});

	it("treats not_observing detach responses as harmless", async () => {
		const requestMock = jest.fn().mockResolvedValue({
			data: { accepted: false, status: "not_observing" },
		});
		const state = createState({
			chatId: "chat_1",
			runAgentById: new Map([["run_1", "agent_alpha"]]),
		});
		const cleanup = registerDetachRunListener({
			dispatch,
			stateRef: { current: state },
			querySessionsRef: { current: new Map() },
			activeQuerySessionRequestIdRef: { current: "" },
			getWsClientImpl: () => ({ request: requestMock }) as any,
			logMissing: true,
		});

		mockWindow.dispatchEvent(new MockCustomEvent("agent:detach-run", {
			detail: { chatId: "chat_1", runId: "run_1", reason: "chat_switch" },
		}));
		await Promise.resolve();

		expect(requestMock).toHaveBeenCalledTimes(1);
		expect(dispatch).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "APPEND_DEBUG",
				line: expect.stringContaining("not_observing"),
			}),
		);

		cleanup();
	});

	it("skips detach when the agent key cannot be resolved", () => {
		const requestMock = jest.fn();
		const cleanup = registerDetachRunListener({
			dispatch,
			stateRef: { current: createState({ chatId: "chat_1" }) },
			querySessionsRef: { current: new Map() },
			activeQuerySessionRequestIdRef: { current: "" },
			getWsClientImpl: () => ({ request: requestMock }) as any,
			logMissing: true,
		});

		mockWindow.dispatchEvent(new MockCustomEvent("agent:detach-run", {
			detail: { chatId: "chat_1", runId: "run_1", reason: "chat_switch" },
		}));

		expect(requestMock).not.toHaveBeenCalled();
		expect(dispatch).toHaveBeenCalledWith({
			type: "APPEND_DEBUG",
			line: "[ws detach] skipped: missing runId or agentKey (chatId=chat_1)",
		});

		cleanup();
	});
});

describe("registerAttachRunListener", () => {
	const dispatch = jest.fn();
	const handleEvent = jest.fn();
	let mockWindow: ReturnType<typeof setupMockWindow>["mockWindow"];
	let MockCustomEvent: ReturnType<typeof setupMockWindow>["MockCustomEvent"];

	beforeEach(() => {
		dispatch.mockReset();
		handleEvent.mockReset();
		const setup = setupMockWindow();
		mockWindow = setup.mockWindow;
		MockCustomEvent = setup.MockCustomEvent;
	});

	afterEach(() => {
		restoreWindow();
	});

	function setupAttachTest() {
		const streams: Array<{
			options: Record<string, any>;
			abort: jest.Mock;
		}> = [];
		const streamMock = jest.fn((options: Record<string, any>) => {
			const entry = {
				options,
				abort: jest.fn(),
			};
			streams.push(entry);
			return { abort: entry.abort };
		});
		const wsClient = {
			stream: streamMock,
			request: jest.fn().mockResolvedValue({ data: { accepted: true, status: "detached" } }),
			connect: jest.fn(),
			updateOptions: jest.fn(),
		};
		const activeAttachRef = { current: null as any };
		const querySessionsRef = { current: new Map() };
		const chatQuerySessionIndexRef = { current: new Map() };
		const activeQuerySessionRequestIdRef = { current: "" };
		const cleanup = registerAttachRunListener({
			dispatch,
			stateRef: { current: createState({ transportMode: "ws" }) },
			handleEvent,
			activeAttachRef,
			querySessionsRef,
			chatQuerySessionIndexRef,
			activeQuerySessionRequestIdRef,
			getWsClientImpl: () => wsClient as any,
		});
		return {
			streams,
			streamMock,
			wsClient,
			activeAttachRef,
			querySessionsRef,
			chatQuerySessionIndexRef,
			activeQuerySessionRequestIdRef,
			cleanup,
		};
	}

	it("attaches, dedupes, and clears state on completion", () => {
		const { streams, streamMock, activeAttachRef, querySessionsRef, chatQuerySessionIndexRef, activeQuerySessionRequestIdRef, cleanup } = setupAttachTest();

		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha", lastSeq: 0 },
		}));
		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha", lastSeq: 0 },
		}));

		expect(streamMock).toHaveBeenCalledTimes(1);
		const callArgs = streamMock.mock.calls[0][0];
		expect(callArgs).toMatchObject({
			type: "/api/attach",
			payload: { runId: "run_1", agentKey: "agent_alpha", lastSeq: 0 },
		});
		const requestId = callArgs.requestId;
		expect(requestId).toBeTruthy();
		expect(dispatch).toHaveBeenCalledWith({ type: "SET_RUN_ID", runId: "run_1" });
		expect(dispatch).toHaveBeenCalledWith({ type: "SET_REQUEST_ID", requestId });
		expect(dispatch).toHaveBeenCalledWith({ type: "SET_STREAMING", streaming: true });
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_ABORT_CONTROLLER",
			controller: expect.any(AbortController),
		});
		expect(querySessionsRef.current.get(requestId)).toEqual(expect.objectContaining({
			requestId,
			chatId: "chat_1",
			runId: "run_1",
			streaming: true,
			abortController: expect.any(AbortController),
		}));
		expect(chatQuerySessionIndexRef.current.get("chat_1")).toBe(requestId);
		expect(activeQuerySessionRequestIdRef.current).toBe(requestId);

		// Complete the stream
		callArgs.onDone?.("done", 9);

		expect(dispatch).toHaveBeenCalledWith({ type: "SET_STREAMING", streaming: false });
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_ABORT_CONTROLLER",
			controller: null,
		});
		expect(querySessionsRef.current.get(requestId)).toEqual(expect.objectContaining({
			streaming: false,
			abortController: null,
		}));
		expect(activeQuerySessionRequestIdRef.current).toBe("");

		cleanup();
	});

	it("resolves agentKey from run identity before chat fallback", () => {
		const streamMock = jest.fn(() => ({ abort: jest.fn() }));
		const requestMock = jest.fn().mockResolvedValue({ data: { accepted: true, status: "detached" } });
		const wsClient = { stream: streamMock, request: requestMock };
		const cleanup = registerAttachRunListener({
			dispatch,
			stateRef: {
				current: createState({
					transportMode: "ws",
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
			getWsClientImpl: () => wsClient as any,
		});

		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", lastSeq: 0 },
		}));

		expect(streamMock).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "/api/attach",
				payload: { runId: "run_1", agentKey: "agent_run", lastSeq: 0 },
			}),
		);
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_RUN_AGENT_BY_ID",
			runId: "run_1",
			agentKey: "agent_run",
		});
		cleanup();
	});

	it("renders request.query from attached streams", () => {
		let attachedOnEvent: ((event: AgentEvent) => void) | null = null;
		const streamMock = jest.fn((options: Record<string, any>) => {
			attachedOnEvent = options.onEvent;
			return { abort: jest.fn() };
		});
		const requestMock = jest.fn().mockResolvedValue({ data: { accepted: true, status: "detached" } });
		const wsClient = {
			stream: streamMock,
			request: requestMock,
		};
		const activeAttachRef = { current: null as any };
		const querySessionsRef = { current: new Map() };
		const chatQuerySessionIndexRef = { current: new Map() };
		const activeQuerySessionRequestIdRef = { current: "" };
		const cleanup = registerAttachRunListener({
			dispatch,
			stateRef: { current: createState({ transportMode: "ws" }) },
			handleEvent,
			activeAttachRef,
			querySessionsRef,
			chatQuerySessionIndexRef,
			activeQuerySessionRequestIdRef,
			getWsClientImpl: () => wsClient as any,
		});

		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha", lastSeq: 0 },
		}));
		attachedOnEvent?.({
			type: "request.query",
			requestId: "req_1",
			query: "attached query",
			references: [{ name: "demo.txt", sizeBytes: 12 }],
			timestamp: 100,
		} as any);

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
		const streams: Array<{ abort: jest.Mock }> = [];
		const streamMock = jest.fn((options: Record<string, any>) => {
			const entry = { abort: jest.fn() };
			streams.push(entry);
			return entry;
		});
		const requestMock = jest.fn().mockResolvedValue({ data: { accepted: true, status: "detached" } });
		const wsClient = {
			stream: streamMock,
			request: requestMock,
		};
		const activeAttachRef = { current: null as any };
		const querySessionsRef = { current: new Map() };
		const chatQuerySessionIndexRef = { current: new Map() };
		const activeQuerySessionRequestIdRef = { current: "" };
		const cleanup = registerAttachRunListener({
			dispatch,
			stateRef: { current: createState({ transportMode: "ws" }) },
			handleEvent,
			activeAttachRef,
			querySessionsRef,
			chatQuerySessionIndexRef,
			activeQuerySessionRequestIdRef,
			getWsClientImpl: () => wsClient as any,
		});

		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha", lastSeq: 0 },
		}));
		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_2", agentKey: "agent_alpha", lastSeq: 0 },
		}));

		expect(streams).toHaveLength(2);
		expect(streams[0].abort).toHaveBeenCalledTimes(1);
		expect(requestMock).toHaveBeenCalledWith({
			type: "/api/detach",
			payload: {
				runId: "run_1",
				agentKey: "agent_alpha",
				reason: "attach_switch",
			},
		});

		cleanup();
	});

	it("retries up to 5 times on connection failure before server activity", async () => {
		jest.useFakeTimers();
		const streams: Array<{
			options: Record<string, any>;
			abort: jest.Mock;
		}> = [];
		const streamMock = jest.fn((options: Record<string, any>) => {
			// First 5 calls trigger onError synchronously; last call triggers onEvent + onDone
			if (streamMock.mock.calls.length <= WS_STREAM_RETRY_DELAYS_MS.length) {
				options.onError?.(new Error("WebSocket connection failed"));
			} else {
				options.onEvent?.({ type: "content.delta", text: "attached data" });
				options.onDone?.("done", 1);
			}
			return { abort: jest.fn() };
		});
		const wsClient = {
			stream: streamMock,
			request: jest.fn().mockResolvedValue({ data: { accepted: true, status: "detached" } }),
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
		};
		const activeAttachRef = { current: null as any };
		const querySessionsRef = { current: new Map() };
		const chatQuerySessionIndexRef = { current: new Map() };
		const activeQuerySessionRequestIdRef = { current: "" };
		const cleanup = registerAttachRunListener({
			dispatch,
			stateRef: { current: createState({ transportMode: "ws" }) },
			handleEvent,
			activeAttachRef,
			querySessionsRef,
			chatQuerySessionIndexRef,
			activeQuerySessionRequestIdRef,
			getWsClientImpl: () => wsClient as any,
		});

		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha", lastSeq: 5 },
		}));

		// Advance through all retry delays
		for (const delayMs of WS_STREAM_RETRY_DELAYS_MS) {
			await jest.advanceTimersByTimeAsync(delayMs);
		}
		// Flush microtasks for connect resolves
		await Promise.resolve();
		await Promise.resolve();

		expect(streamMock).toHaveBeenCalledTimes(WS_STREAM_RETRY_DELAYS_MS.length + 1);
		// Each call should have same runId/agentKey/lastSeq
		for (const [call] of streamMock.mock.calls) {
			expect(call).toMatchObject({
				type: "/api/attach",
				payload: { runId: "run_1", agentKey: "agent_alpha", lastSeq: 5 },
			});
		}
		expect(wsClient.connect).toHaveBeenCalledTimes(WS_STREAM_RETRY_DELAYS_MS.length);
		expect(handleEvent).toHaveBeenCalledWith(
			expect.objectContaining({ type: "content.delta", text: "attached data" }),
		);

		cleanup();
		jest.useRealTimers();
	});

	it("does not retry after receiving an attach event before connection error", async () => {
		jest.useFakeTimers();
		const streams: Array<{ options: Record<string, any>; abort: jest.Mock }> = [];
		const streamMock = jest.fn((options: Record<string, any>) => {
			const entry = { options, abort: jest.fn() };
			streams.push(entry);
			// First call sends event first, then error
			options.onEvent?.({ type: "content.delta", text: "data before error" });
			setTimeout(() => {
				options.onError?.(new Error("WebSocket transport disconnected"));
			}, 0);
			return { abort: entry.abort };
		});
		const wsClient = {
			stream: streamMock,
			request: jest.fn().mockResolvedValue({ data: { accepted: true, status: "detached" } }),
			connect: jest.fn(),
		};
		const activeAttachRef = { current: null as any };
		const querySessionsRef = { current: new Map() };
		const chatQuerySessionIndexRef = { current: new Map() };
		const activeQuerySessionRequestIdRef = { current: "" };
		const cleanup = registerAttachRunListener({
			dispatch,
			stateRef: { current: createState({ transportMode: "ws" }) },
			handleEvent,
			activeAttachRef,
			querySessionsRef,
			chatQuerySessionIndexRef,
			activeQuerySessionRequestIdRef,
			getWsClientImpl: () => wsClient as any,
		});

		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha", lastSeq: 0 },
		}));

		await Promise.resolve();
		await Promise.resolve();

		// Only 1 call should have been made (no retry after server activity)
		expect(streamMock).toHaveBeenCalledTimes(1);
		expect(handleEvent).toHaveBeenCalledWith(
			expect.objectContaining({ type: "content.delta", text: "data before error" }),
		);

		cleanup();
		jest.useRealTimers();
	});

	it("does not abort current attach during retry; abort only on run switch", async () => {
		jest.useFakeTimers();
		const streams: Array<{ options: Record<string, any>; abort: jest.Mock }> = [];
		const streamMock = jest.fn((options: Record<string, any>) => {
			const entry = { options, abort: jest.fn() };
			streams.push(entry);
			// First two calls fail with connection error
			if (streams.length <= 1) {
				setTimeout(() => {
					options.onError?.(new Error("WebSocket connection failed"));
				}, 0);
			} else if (streams.length === 2) {
				// Second call — send event + done (success after retry)
				setTimeout(() => {
					options.onEvent?.({ type: "content.delta", text: "success" });
					options.onDone?.("done", 1);
				}, 0);
			}
			return { abort: entry.abort };
		});
		const wsClient = {
			stream: streamMock,
			request: jest.fn().mockResolvedValue({ data: { accepted: true, status: "detached" } }),
			connect: jest.fn().mockResolvedValue(undefined),
			updateOptions: jest.fn(),
		};
		const activeAttachRef = { current: null as any };
		const querySessionsRef = { current: new Map() };
		const chatQuerySessionIndexRef = { current: new Map() };
		const activeQuerySessionRequestIdRef = { current: "" };
		const cleanup = registerAttachRunListener({
			dispatch,
			stateRef: { current: createState({ transportMode: "ws" }) },
			handleEvent,
			activeAttachRef,
			querySessionsRef,
			chatQuerySessionIndexRef,
			activeQuerySessionRequestIdRef,
			getWsClientImpl: () => wsClient as any,
		});

		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha", lastSeq: 0 },
		}));

		// Advance through first retry delay - no abort should happen
		await jest.advanceTimersByTimeAsync(WS_STREAM_RETRY_DELAYS_MS[0]);

		// Wait for connect + retry stream to start
		await Promise.resolve();
		await Promise.resolve();

		// The first stream's abort should NOT have been called during retry
		expect(streams[0].abort).not.toHaveBeenCalled();

		// Now switch to a different run — the old run's abort should be triggered
		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_2", agentKey: "agent_alpha", lastSeq: 0 },
		}));

		// The first stream should now be aborted because of the new attach
		expect(streams[0].abort).toHaveBeenCalledTimes(1);

		cleanup();
		jest.useRealTimers();
	});
});

describe("connectWsTransport continued", () => {
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

	it("upserts run.started on the active chat and auto-attaches when not streaming", async () => {
		const { initWsClientImpl, getOnPush } = createConnectedWsClient();
		const state = createState({ accessToken: "token_local", chatId: "chat_active" });
		const dispatchEvent = jest.fn();
		class MockCustomEvent {
			type: string;
			detail: { chatId: string; runId: string; agentKey: string; lastSeq: number };

			constructor(type: string, init?: { detail?: { chatId: string; runId: string; agentKey?: string; lastSeq: number } }) {
				this.type = type;
				this.detail = { chatId: "", runId: "", agentKey: "", lastSeq: 0, ...(init?.detail || {}) };
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
				runId: "run_started",
				agentKey: "agent_started",
			},
		});

		expect(dispatchEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "agent:attach-run",
				detail: {
					chatId: "chat_active",
					runId: "run_started",
					agentKey: "agent_started",
					lastSeq: 0,
				},
			}),
		);
	});

	it("reloads the active chat from persisted chat.updated pushes when idle", async () => {
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
			type: "chat.updated",
			payload: {
				chatId: "chat_active",
				lastRunContent: "updated elsewhere",
			},
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_active",
				lastRunContent: "updated elsewhere",
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

	it("updates chat read state and agent unread counts from chat.read/chat.unread push frames", async () => {
		const { initWsClientImpl, getOnPush } = createConnectedWsClient();
		const state = createState({
			accessToken: "token_local",
			agents: [
				{
					key: "agent_alpha",
					name: "Alpha",
					stats: { unreadCount: 2 },
				},
			],
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
			type: "chat.read",
			payload: {
				chatId: "chat_1",
				agentKey: "agent_alpha",
				lastRunId: "run_1",
				readAt: 111,
				readRunId: "run_1",
				agentUnreadCount: 1,
			},
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_1",
				lastRunId: "run_1",
				read: {
					isRead: true,
					readAt: 111,
					readRunId: "run_1",
				},
			}),
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_AGENTS",
			agents: [
				expect.objectContaining({
					key: "agent_alpha",
					stats: expect.objectContaining({
						unreadCount: 1,
					}),
				}),
			],
		});

		dispatch.mockClear();

		getOnPush()?.({
			frame: "push",
			type: "chat.unread",
			payload: {
				chatId: "chat_1",
				agentKey: "agent_alpha",
				lastRunId: "run_2",
				readAt: 0,
				readRunId: "",
				agentUnreadCount: 2,
			},
		});

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_1",
				lastRunId: "run_2",
				read: {
					isRead: false,
					readAt: 0,
				},
			}),
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_AGENTS",
			agents: [
				expect.objectContaining({
					key: "agent_alpha",
					stats: expect.objectContaining({
						unreadCount: 2,
					}),
				}),
			],
		});
		expect(handleEvent).not.toHaveBeenCalled();
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
