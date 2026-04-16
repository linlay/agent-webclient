import type { AppAction } from "../context/AppContext";
import type { AppState, AgentEvent } from "../context/types";
import { connectWsTransport } from "./useWsTransport";

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

	beforeEach(() => {
		dispatch.mockReset();
		handleEvent.mockReset();
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
});
