import { dataQueryCache } from "@/shared/data/query/serverState";
import type { Chat } from "@/features/chats/lib/chatState";
import type { AppAction } from "@/app/state/AppContext";
import type { AppState } from "@/app/state/AppContext";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { appReducer } from "@/app/state/reducer";
import { createLiveQuerySession } from "@/features/conversation/lib/conversationSession";
import { registerMainChatRunActivationListener } from "@/features/runs/hooks/useMainChatRunActivation";
import { createConversationPushHandler, registerAttachRunListener, registerDetachRunListener } from "@/features/conversation/hooks/useConversationWsRuntime";
import type { WsPushFrame } from "@/features/transport/lib/wsClient";
import { PlatformRunTransport } from "@/features/transport/lib/platformRunTransport";
import type { PlatformFrameClient } from "@/features/transport/lib/platformFrameClient";

const DEBUG_RUN_OBSERVATION_EVENT_TYPE = "debug.runObservation";
const EPOCH_MS = 1_710_000_000_000;
const globalWithRuntimeConfig = globalThis as typeof globalThis & {
	__AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

const PUSH_REQUIRED_TIME_FIELDS: Record<string, string> = {
	heartbeat: "timestamp",
	"auth.expiring": "expiresAt",
	"run.started": "startedAt",
	"run.finished": "finishedAt",
	"chat.created": "createdAt",
	"chat.updated": "updatedAt",
	"chat.unread": "createdAt",
	"chat.read": "readAt",
	"catalog.updated": "updatedAt",
	"awaiting.asking": "createdAt",
	"awaiting.answered": "answeredAt",
	"resource.pushed": "pushedAt",
};

function withPushContractTime(frame: Record<string, unknown>): Record<string, unknown> {
	const type = String(frame.type || "");
	if (type === "archive.restored") {
		const containerKey = frame.payload && typeof frame.payload === "object" && !Array.isArray(frame.payload)
			? "payload"
			: frame.data && typeof frame.data === "object" && !Array.isArray(frame.data)
				? "data"
				: null;
		if (!containerKey) return frame;
		const container = frame[containerKey] as Record<string, unknown>;
		if (!container.summary || typeof container.summary !== "object" || Array.isArray(container.summary)) {
			return frame;
		}
		return {
			...frame,
			[containerKey]: {
				...container,
				summary: {
					...(container.summary as Record<string, unknown>),
					createdAt: (container.summary as Record<string, unknown>).createdAt ?? EPOCH_MS,
					updatedAt: (container.summary as Record<string, unknown>).updatedAt ?? EPOCH_MS,
					lastRunAt: (container.summary as Record<string, unknown>).lastRunAt ?? EPOCH_MS,
					archivedAt: (container.summary as Record<string, unknown>).archivedAt ?? EPOCH_MS,
				},
			},
		};
	}

	const timeField = PUSH_REQUIRED_TIME_FIELDS[type];
	if (!timeField || frame[timeField] !== undefined) {
		return frame;
	}
	if (frame.payload && typeof frame.payload === "object" && !Array.isArray(frame.payload)) {
		const payload = frame.payload as Record<string, unknown>;
		return {
			...frame,
			payload: { ...payload, [timeField]: payload[timeField] ?? EPOCH_MS },
		};
	}
	if (frame.data && typeof frame.data === "object" && !Array.isArray(frame.data)) {
		const data = frame.data as Record<string, unknown>;
		return {
			...frame,
			data: { ...data, [timeField]: data[timeField] ?? EPOCH_MS },
		};
	}
	return { ...frame, [timeField]: EPOCH_MS };
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
		agents: [],
		teams: [],
		chats: [],
		automations: [],
		sidebarPendingRequestCount: 0,
		chatAgentById: new Map(),
		runAgentById: new Map(),
		currentRunAgentKey: "",
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
		debugEvents: [],
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
		workerSelectionKey: "",
		workerRows: [],
		workerIndexByKey: new Map(),
		workerRelatedChats: [],
		workerChatPanelCollapsed: true,
		chatLoadSeq: 0,
		leftDrawerOpen: false,
		rightSidebarOpen: false,
		rightSidebarOpenTab: null,
		rightSidebarOpenSeq: 0,
		viewerTabs: [],
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
		pendingSteers: {},
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
		...overrides,
	};
}

function debugEvents(dispatchMock: jest.Mock<void, [AppAction]>, stage?: string) {
	return dispatchMock.mock.calls
		.map(([action]) => action)
		.filter(
			(action) =>
				action.type === "PUSH_EVENT" &&
				action.event.type === DEBUG_RUN_OBSERVATION_EVENT_TYPE &&
				(!stage || (action.event as Record<string, unknown>).stage === stage),
		)
		.map((action) => (action as Extract<AppAction, { type: "PUSH_EVENT" }>).event);
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

describe("createConversationPushHandler", () => {
	const handleEvent = jest.fn<void, [AgentEvent]>();
	const dispatch = jest.fn<void, [AppAction]>();
	const originalWindow = (globalThis as { window?: unknown }).window;
	const originalCustomEvent = (globalThis as { CustomEvent?: unknown }).CustomEvent;

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


  it("refreshes pins and invalidates navigation caches after another client's reorder", () => {
    const invalidate = jest.spyOn(dataQueryCache, "invalidatePrefix");
    const dispatchEvent = jest.fn();
    Object.defineProperty(globalThis, "window", { value: { dispatchEvent }, configurable: true, writable: true });
    Object.defineProperty(globalThis, "CustomEvent", { value: class { constructor(public type: string) {} }, configurable: true, writable: true });
    const onPush = createConversationPushHandler({ dispatch, stateRef: { current: createState() }, handleEvent });
    onPush({ frame: "push", type: "chats.order.changed", data: { updatedAt: EPOCH_MS } });
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "agent:refresh-worker-data" }));
    expect(invalidate).toHaveBeenCalledWith("request:chats.list");
    expect(invalidate).toHaveBeenCalledWith("request:agents.list");
    invalidate.mockRestore();
  });

	it("reads current chat state on every push and ignores heartbeat and invalid updates", () => {
		const stateRef = { current: createState({ chatId: "chat_1" }) };
		const onPush = createConversationPushHandler({ dispatch, stateRef, handleEvent });
		const event: WsPushFrame = {
			frame: "push", type: "content.delta", chatId: "chat_1", contentId: "content_1", delta: "text",
		};
		onPush({ frame: "push", type: "heartbeat", timestamp: EPOCH_MS });
		expect(dispatch).not.toHaveBeenCalled();
		onPush({ frame: "push", type: "chat.updated", chatId: "chat_1", updatedAt: "invalid" });
		expect(dispatch).toHaveBeenCalledTimes(1);
		expect(dispatch).toHaveBeenCalledWith({
			type: "APPEND_DEBUG", line: expect.stringContaining("time_contract_violation"),
		});
		expect(handleEvent).not.toHaveBeenCalled();
		onPush(event);
		expect(handleEvent).toHaveBeenCalledTimes(1);
		stateRef.current = createState({ chatId: "chat_2" });
		onPush(event);
		expect(handleEvent).toHaveBeenCalledTimes(1);
	});

	it("upserts chat.created for a different chat via websocket push", async () => {
		const state = createState({ accessToken: "token_local", chatId: "chat_active" });

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "chat.created",
			payload: {
				chatId: "chat_new",
				chatName: "New Chat",
				agentKey: "agent_alpha",
				source: "automation:daily",
			},
		}) as WsPushFrame);

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_new",
				chatName: "New Chat",
				agentKey: "agent_alpha",
				firstAgentKey: "agent_alpha",
				source: "automation:daily",
			}),
		});
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("applies chat.renamed while the current query is streaming", async () => {
		const state = createState({
			accessToken: "token_local",
			chatId: "chat_active",
			streaming: true,
		});

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "chat.renamed",
			payload: {
				chatId: "chat_active",
				chatName: "Analyze this image",
				agentKey: "agent_alpha",
			},
		}) as WsPushFrame);

		expect(dispatch).toHaveBeenCalledWith({
			type: "CHAT_RENAMED",
			chatId: "chat_active",
			chatName: "Analyze this image",
		});
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("rejects string, second, floating, and missing semantic times on state-mutating websocket pushes", async () => {
		const state = createState({ accessToken: "token_local" });

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		for (const updatedAt of [
			String(EPOCH_MS),
			Math.floor(EPOCH_MS / 1000),
			EPOCH_MS + 0.5,
			undefined,
		]) {
			onPush({
				frame: "push",
				type: "chat.updated",
				payload: {
					chatId: "chat_bad_time",
					...(updatedAt === undefined ? {} : { updatedAt }),
				},
			});
		}

		expect(dispatch).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: "UPSERT_CHAT" }),
		);
		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "APPEND_DEBUG",
				line: expect.stringContaining("time_contract_violation"),
			}),
		);
	});

	it("upserts chat.created when the backend sends nested data instead of payload", async () => {
		const state = createState({ accessToken: "token_local", chatId: "chat_active" });

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "chat.created",
			data: {
				chatId: "chat_from_data",
				chatName: "Chat From Data",
				agentKey: "agent_data",
			},
		}) as WsPushFrame);

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

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "chat.archived",
			payload: {
				chatId: "chat_active",
			},
		}) as WsPushFrame);

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

	it("upserts restored chat summaries when archive.restored arrives over push", async () => {
		const state = createState({ accessToken: "token_local", chatId: "" });
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

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "archive.restored",
			payload: {
				chatId: "chat_restored",
				agentKey: "agent_a",
				summary: {
					chatId: "chat_restored",
					chatName: "Restored",
					agentKey: "agent_a",
				},
			},
		}) as WsPushFrame);

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_restored",
				chatName: "Restored",
				agentKey: "agent_a",
			}),
		});
		expect(dispatchEvent).toHaveBeenCalledWith(
			expect.objectContaining({ type: "agent:refresh-worker-data" }),
		);
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("upserts run.started for another chat without dropping it on the current-chat filter", async () => {
		const state = createState({ accessToken: "token_local", chatId: "chat_active" });

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "run.started",
			payload: {
				chatId: "chat_remote",
				runId: "run_remote",
				agentKey: "agent_remote",
				startedAt: EPOCH_MS + 10,
			},
		}) as WsPushFrame);

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_remote",
				lastRunId: "run_remote",
				agentKey: "agent_remote",
				firstAgentKey: "agent_remote",
				updatedAt: EPOCH_MS + 10,
			}),
		});
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("upserts awaiting.asking for another chat and keeps it out of the active timeline", async () => {
		const state = createState({ accessToken: "token_local", chatId: "chat_active" });

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "awaiting.asking",
			payload: {
				chatId: "chat_remote",
				runId: "run_remote",
				awaitingId: "await_1",
				createdAt: 1776830869957,
			},
		}) as WsPushFrame);

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
		const state = createState({ accessToken: "token_local", chatId: "chat_active" });

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
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
		}) as WsPushFrame);

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

	it("does not dispatch agent:attach-run for active awaiting.asking push events", async () => {
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

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
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
		}) as WsPushFrame);

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
		expect(dispatchEvent).not.toHaveBeenCalled();
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("only updates chat summary when an awaiting push lacks attach identity", async () => {
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

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "awaiting.asking",
			data: {
				awaitingId: "await_active",
				chatId: "chat_active",
				createdAt: 1780737509785,
				mode: "question",
				runId: "run_active",
			},
		}) as WsPushFrame);

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_active",
				lastRunId: "run_active",
				hasPendingAwaiting: true,
			}),
		});
		expect(dispatchEvent).not.toHaveBeenCalled();
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("clears pending awaiting state when awaiting.answered arrives over push", async () => {
		const state = createState({ accessToken: "token_local", chatId: "chat_active" });

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "awaiting.answered",
			payload: {
				chatId: "chat_remote",
				runId: "run_remote",
				awaitingId: "await_1",
				answeredAt: EPOCH_MS + 20,
			},
		}) as WsPushFrame);

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_remote",
				lastRunId: "run_remote",
				hasPendingAwaiting: false,
				updatedAt: EPOCH_MS + 20,
			}),
		});
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("does not dispatch agent:attach-run for active awaiting.answered push events", async () => {
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

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "awaiting.answered",
			payload: {
				chatId: "chat_active",
				runId: "run_active_v2",
				agentKey: "agent_active",
				agentUnreadCount: 0,
			},
		}) as WsPushFrame);

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_active",
				lastRunId: "run_active_v2",
				hasPendingAwaiting: false,
			}),
		});
		expect(dispatchEvent).not.toHaveBeenCalled();
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

	it.each(["chat_switch", "new_conversation", "page_leave", "transport_cleanup"])(
		"aborts only the matching local execution for %s",
		(reason) => {
			const session = createLiveQuerySession({
				requestId: "req_1", chatId: "chat_1", owner: { kind: "agent", agentKey: "agent_alpha" },
			});
			session.runId = "run_1";
			session.abortController = new AbortController();
			const other = createLiveQuerySession({
				requestId: "req_2", chatId: "chat_2", owner: { kind: "agent", agentKey: "agent_alpha" },
			});
			other.runId = "run_2";
			other.abortController = new AbortController();
			const cleanup = registerDetachRunListener({
				dispatch,
				stateRef: { current: createState() },
				querySessionsRef: { current: new Map([[session.requestId, session], [other.requestId, other]]) },
				activeQuerySessionRequestIdRef: { current: session.requestId },
				logMissing: true,
			});
			mockWindow.dispatchEvent(new MockCustomEvent("agent:detach-run", { detail: { reason } }));
			expect(session.abortController.signal.aborted).toBe(true);
			expect(other.abortController.signal.aborted).toBe(false);
			expect(dispatch).not.toHaveBeenCalled();
			cleanup();
		},
	);

	it("detaches a saved Team attach despite a stale member agent and removes the listener on cleanup", () => {
		const abort = jest.fn();
		const cleanup = registerDetachRunListener({
			dispatch,
			stateRef: { current: createState({
				chatId: "chat_team", runId: "run_team",
				chats: [{ chatId: "chat_team", teamId: "team_1", agentKey: "stale_member" } as Chat],
			}) },
			querySessionsRef: { current: new Map() },
			activeQuerySessionRequestIdRef: { current: "" },
			activeAttachRef: { current: {
				requestId: "req_team", chatId: "chat_team", runId: "run_team", agentKey: "",
				owner: { kind: "orchestrated-team", teamId: "team_1" }, controller: new AbortController(), abort,
			} },
		});
		const event = new MockCustomEvent("agent:detach-run", { detail: { reason: "chat_switch" } });
		mockWindow.dispatchEvent(event);
		expect(abort).toHaveBeenCalledTimes(1);
		cleanup();
		mockWindow.dispatchEvent(event);
		expect(abort).toHaveBeenCalledTimes(1);
	});

	it.each([
		[{}, "[ws detach] skipped: missing runId or owner (chatId=chat_1)"],
		[{ agentKey: "agent_alpha" }, "[run detach] skipped: no local execution (runId=run_1)"],
	])("skips detach without a matching local execution (%j)", (identity, line) => {
		const cleanup = registerDetachRunListener({
			dispatch,
			stateRef: { current: createState({ chatId: "chat_1" }) },
			querySessionsRef: { current: new Map() },
			activeQuerySessionRequestIdRef: { current: "" },
			logMissing: true,
		});
		mockWindow.dispatchEvent(new MockCustomEvent("agent:detach-run", {
			detail: { chatId: "chat_1", runId: "run_1", ...identity },
		}));
		expect(dispatch).toHaveBeenCalledWith({ type: "APPEND_DEBUG", line });
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

	function setupAttachTest(ensureClient?: () => Promise<PlatformFrameClient>) {
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
			stateRef: { current: createState() },
			handleEvent,
			activeAttachRef,
			querySessionsRef,
			chatQuerySessionIndexRef,
			activeQuerySessionRequestIdRef,
			runs: new PlatformRunTransport(ensureClient ?? (async () => wsClient as unknown as PlatformFrameClient)),
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

	it("attaches, dedupes, and clears state on completion", async () => {
		const { streams, streamMock, activeAttachRef, querySessionsRef, chatQuerySessionIndexRef, activeQuerySessionRequestIdRef, cleanup } = setupAttachTest();

		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha", lastSeq: 0 },
		}));
		await Promise.resolve();
		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha", lastSeq: 0 },
		}));
		await Promise.resolve();

		expect(streamMock).toHaveBeenCalledTimes(1);
		expect(debugEvents(dispatch, "attachRunRequested")).toEqual([
			expect.objectContaining({
				chatId: "chat_1",
				runId: "run_1",
				agentKey: "agent_alpha",
			}),
		]);
		expect(debugEvents(dispatch, "attachRunIgnored")).toEqual([
			expect.objectContaining({
				chatId: "chat_1",
				runId: "run_1",
				agentKey: "agent_alpha",
				reason: "duplicate_observe_local",
			}),
		]);
		const callArgs = streamMock.mock.calls[0][0];
		expect(callArgs).toMatchObject({
			type: "/api/attach",
			payload: { runId: "run_1", agentKey: "agent_alpha", lastSeq: 0 },
		});
		const requestId = activeQuerySessionRequestIdRef.current;
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
		await Promise.resolve();
		expect(chatQuerySessionIndexRef.current.get("chat_1")).toBe(requestId);
		expect(activeQuerySessionRequestIdRef.current).toBe(requestId);

		// Complete the stream
		callArgs.onDone?.("done", 9);
		await Promise.resolve();

		expect(dispatch).toHaveBeenCalledWith({ type: "SET_STREAMING", streaming: false });
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_ABORT_CONTROLLER",
			controller: null,
		});
		expect(querySessionsRef.current.get(requestId)).toEqual(expect.objectContaining({
			streaming: false,
			abortController: null,
		}));
		await Promise.resolve();
		expect(activeQuerySessionRequestIdRef.current).toBe("");

		cleanup();
	});

	it("does not attach a run already observed by a live query", async () => {
		const streamMock = jest.fn(() => ({ abort: jest.fn() }));
		const wsClient = {
			stream: streamMock,
			request: jest.fn(),
		};
		const querySessionsRef = {
			current: new Map<string, any>([["req_live", {
				requestId: "req_live",
				observationSource: "query",
				chatId: "chat_1",
				runId: "run_1",
				agentKey: "agent_alpha",
				owner: { kind: "agent", agentKey: "agent_alpha" },
				streaming: true,
			}]])
		};
		const cleanup = registerAttachRunListener({
			dispatch,
			stateRef: { current: createState() },
			handleEvent,
			activeAttachRef: { current: null },
			querySessionsRef,
			chatQuerySessionIndexRef: { current: new Map() },
			activeQuerySessionRequestIdRef: { current: "req_live" },
			runs: new PlatformRunTransport(async () => wsClient as unknown as PlatformFrameClient),
		});

		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha" },
		}));
		await Promise.resolve();

		expect(streamMock).not.toHaveBeenCalled();
		expect(debugEvents(dispatch, "attachRunIgnored")).toEqual([
			expect.objectContaining({ reason: "live_query_observing" }),
		]);
		cleanup();
	});

	it("resolves attach agentKey from run identity before attach detail and chat fallback", async () => {
		const streamMock = jest.fn(() => ({ abort: jest.fn() }));
		const requestMock = jest.fn().mockResolvedValue({ data: { accepted: true, status: "detached" } });
		const wsClient = { stream: streamMock, request: requestMock };
		const cleanup = registerAttachRunListener({
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
			runs: new PlatformRunTransport(async () => wsClient as unknown as PlatformFrameClient),
		});

		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_detail", lastSeq: 0 },
		}));
		await Promise.resolve();

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

	it("attaches a saved Team chat with only teamId despite a member event", async () => {
		const streamMock = jest.fn(() => ({ abort: jest.fn() }));
		const wsClient = {
			stream: streamMock,
			request: jest.fn().mockResolvedValue({ data: { accepted: true, status: "detached" } }),
		};
		const cleanup = registerAttachRunListener({
			dispatch,
			stateRef: {
				current: createState({
					chats: [{
						chatId: "chat_team",
						teamId: "team_1",
						agentKey: "stale_member",
					} as Chat],
					runAgentById: new Map([["run_team", "member_from_event"]]),
				}),
			},
			handleEvent,
			activeAttachRef: { current: null },
			querySessionsRef: { current: new Map() },
			chatQuerySessionIndexRef: { current: new Map() },
			activeQuerySessionRequestIdRef: { current: "" },
			runs: new PlatformRunTransport(async () => wsClient as unknown as PlatformFrameClient),
		});

		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_team", runId: "run_team", agentKey: "member_from_event" },
		}));
		await Promise.resolve();

		const payload = streamMock.mock.calls[0][0].payload;
		expect(payload).toEqual({ runId: "run_team", teamId: "team_1", lastSeq: 0 });
		expect(payload).not.toHaveProperty("agentKey");
		cleanup();
	});

	it("renders request.query from attached streams", async () => {
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
			stateRef: { current: createState() },
			handleEvent,
			activeAttachRef,
			querySessionsRef,
			chatQuerySessionIndexRef,
			activeQuerySessionRequestIdRef,
			runs: new PlatformRunTransport(async () => wsClient as unknown as PlatformFrameClient),
		});

		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha", lastSeq: 0 },
		}));
		await Promise.resolve();
		attachedOnEvent?.({
			type: "request.query",
			requestId: "req_1",
			query: "attached query",
			references: [{ name: "demo.txt", sizeBytes: 12 }],
			timestamp: EPOCH_MS,
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
		await Promise.resolve();

		cleanup();
	});

	it("aborts the previous attach before starting a new one", async () => {
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
			stateRef: { current: createState() },
			handleEvent,
			activeAttachRef,
			querySessionsRef,
			chatQuerySessionIndexRef,
			activeQuerySessionRequestIdRef,
			runs: new PlatformRunTransport(async () => wsClient as unknown as PlatformFrameClient),
		});

		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha", lastSeq: 0 },
		}));
		await Promise.resolve();
		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_2", agentKey: "agent_alpha", lastSeq: 0 },
		}));
		await Promise.resolve();

		expect(streams).toHaveLength(2);
		expect(streams[0].abort).toHaveBeenCalledTimes(1);
		expect(requestMock).toHaveBeenCalledWith({
			type: "/api/detach",
			payload: {
				runId: "run_1",
				agentKey: "agent_alpha",
				reason: "consumer_detach",
			},
		});

		cleanup();
	});

	it("clears an attach when acquiring the transport fails", async () => {
		const pending = createDeferred<PlatformFrameClient>();
		const { activeAttachRef, activeQuerySessionRequestIdRef, cleanup } = setupAttachTest(() => pending.promise);
		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha" },
		}));
		pending.reject(new Error("WebSocket connection failed"));
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		expect(activeAttachRef.current).toBeNull();
		expect(activeQuerySessionRequestIdRef.current).toBe("");
		expect(dispatch).toHaveBeenCalledWith({ type: "SET_STREAMING", streaming: false });
		cleanup();
	});

	it("does not start a stream when cleanup cancels pending transport acquisition", async () => {
		const pending = createDeferred<PlatformFrameClient>();
		const { wsClient, streamMock, activeAttachRef, cleanup } = setupAttachTest(() => pending.promise);
		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha" },
		}));
		cleanup();
		pending.resolve(wsClient as unknown as PlatformFrameClient);
		await Promise.resolve();
		await Promise.resolve();
		expect(streamMock).not.toHaveBeenCalled();
		expect(activeAttachRef.current).toBeNull();
	});

	it("clears a failed observed stream without replaying delivered events", async () => {
		const { streams, streamMock, activeAttachRef, cleanup } = setupAttachTest();
		mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
			detail: { chatId: "chat_1", runId: "run_1", agentKey: "agent_alpha" },
		}));
		await Promise.resolve();
		const event = { type: "content.delta", chatId: "chat_1", runId: "run_1", text: "delivered" };
		streams[0].options.onEvent(event);
		streams[0].options.onError(new Error("WebSocket transport disconnected"));
		await Promise.resolve();
		expect(handleEvent).toHaveBeenCalledTimes(1);
		expect(handleEvent).toHaveBeenCalledWith(event);
		expect(streamMock).toHaveBeenCalledTimes(1);
		expect(activeAttachRef.current).toBeNull();
		cleanup();
	});

	it("does not let an old execution completion clear a newer attach", async () => {
		const { streams, activeAttachRef, activeQuerySessionRequestIdRef, cleanup } = setupAttachTest();
		for (const runId of ["run_1", "run_2"]) {
			mockWindow.dispatchEvent(new MockCustomEvent("agent:attach-run", {
				detail: { chatId: "chat_1", runId, agentKey: "agent_alpha" },
			}));
			await Promise.resolve();
		}
		await Promise.resolve();
		await Promise.resolve();
		streams[0].options.onDone("done", 12);
		await Promise.resolve();
		expect(activeAttachRef.current?.runId).toBe("run_2");
		expect(activeQuerySessionRequestIdRef.current).toBe(activeAttachRef.current?.requestId);
		expect(dispatch).not.toHaveBeenCalledWith({ type: "SET_STREAMING", streaming: false });
		cleanup();
	});

});

describe("createConversationPushHandler continued", () => {
	const handleEvent = jest.fn<void, [AgentEvent]>();
	const dispatch = jest.fn<void, [AppAction]>();
	const originalWindow = (globalThis as { window?: unknown }).window;
	const originalCustomEvent = (globalThis as { CustomEvent?: unknown }).CustomEvent;

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

	it("upserts run.started on the active chat and broadcasts a main-chat run candidate", async () => {
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

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "run.started",
			payload: {
				chatId: "chat_active",
				runId: "run_started",
				agentKey: "agent_started",
				startedAt: EPOCH_MS + 30,
			},
		}) as WsPushFrame);

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_active",
				lastRunId: "run_started",
				agentKey: "agent_started",
				firstAgentKey: "agent_started",
				hasActiveRun: true,
				activeRun: expect.objectContaining({
					runId: "run_started",
					agentKey: "agent_started",
				}),
				updatedAt: EPOCH_MS + 30,
			}),
		});
		expect(debugEvents(dispatch, "runStartedCandidate")).toEqual([
			expect.objectContaining({
				chatId: "chat_active",
				runId: "run_started",
				agentKey: "agent_started",
				stateChatId: "chat_active",
			}),
		]);
		expect(dispatchEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "agent:run-started-push",
				detail: {
					chatId: "chat_active",
					runId: "run_started",
					agentKey: "agent_started",
					owner: { kind: "agent", agentKey: "agent_started" },
					lastSeq: 0,
				},
			}),
		);
		expect(dispatchEvent).not.toHaveBeenCalledWith(
			expect.objectContaining({
				type: "agent:attach-run",
			}),
		);
	});

	it("unlocks a finished current run so a same-chat background run.started can attach", async () => {
		const abortController = new AbortController();
		const initialState = createState({
			accessToken: "token_local",
			chatId: "chat_active",
			runId: "run_old",
			streaming: true,
			abortController,
			currentChatActiveRun: {
				chatId: "chat_active",
				runId: "run_old",
				agentKey: "agent_active",
			},
			chatAgentById: new Map([["chat_active", "agent_active"]]),
		});
		const stateRef = { current: initialState };
		const localDispatch = jest.fn<void, [AppAction]>((action) => {
			stateRef.current = appReducer(stateRef.current, action);
		});
		const session = createLiveQuerySession({
			requestId: "req_old",
			chatId: "chat_active",
			agentKey: "agent_active",
		});
		session.runId = "run_old";
		session.streaming = true;
		session.abortController = abortController;
		const querySessionsRef = { current: new Map([["req_old", session]]) };
		const activeQuerySessionRequestIdRef = { current: "req_old" };
		const abortActiveAttach = jest.fn();
		const activeAttachRef = {
			current: {
				requestId: "req_old",
				runId: "run_old",
				chatId: "chat_active",
				agentKey: "agent_active",
				controller: abortController,
				abort: abortActiveAttach,
			},
		};
		const listeners = new Map<string, Set<(event: Event) => void>>();
		const dispatched: Array<{ type: string; detail: unknown }> = [];
		class MockCustomEvent {
			type: string;
			detail: unknown;

			constructor(type: string, init?: { detail?: unknown }) {
				this.type = type;
				this.detail = init?.detail;
			}
		}
		Object.defineProperty(globalThis, "window", {
			value: {
				location: { pathname: "/agent/agent_active" },
				addEventListener: jest.fn((type: string, listener: (event: Event) => void) => {
					const current = listeners.get(type) || new Set();
					current.add(listener);
					listeners.set(type, current);
				}),
				removeEventListener: jest.fn((type: string, listener: (event: Event) => void) => {
					listeners.get(type)?.delete(listener);
				}),
				dispatchEvent: jest.fn((event: Event): boolean => {
					dispatched.push({
						type: event.type,
						detail: (event as CustomEvent).detail,
					});
					for (const listener of listeners.get(event.type) || []) {
						listener(event);
					}
					return true;
				}),
			},
			configurable: true,
			writable: true,
		});
		Object.defineProperty(globalThis, "CustomEvent", {
			value: MockCustomEvent,
			configurable: true,
			writable: true,
		});
		const cleanupActivation = registerMainChatRunActivationListener({
			dispatch: localDispatch,
			stateRef,
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			handledRunKeysRef: { current: new Set() },
		});

		const onPush = createConversationPushHandler({
			dispatch: localDispatch,
			stateRef,
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			activeAttachRef,
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "run.finished",
			payload: {
				chatId: "chat_active",
				runId: "run_old",
			},
		}) as WsPushFrame);
		expect(stateRef.current.streaming).toBe(false);
		expect(session.streaming).toBe(false);
		expect(abortActiveAttach).toHaveBeenCalledTimes(1);
		expect(activeAttachRef.current).toBeNull();
		expect(debugEvents(localDispatch, "runObservationReleased")).toEqual([
			expect.objectContaining({
				chatId: "chat_active",
				runId: "run_old",
				reason: "terminal_push",
				stateChatId: "chat_active",
				stateRunId: "run_old",
			}),
		]);

		onPush(withPushContractTime({
			frame: "push",
			type: "run.started",
			payload: {
				chatId: "chat_active",
				runId: "run_new",
				agentKey: "agent_active",
			},
		}) as WsPushFrame);

		expect(localDispatch).toHaveBeenCalledWith({
			type: "SET_CURRENT_CHAT_ACTIVE_RUN",
			activeRun: {
				chatId: "chat_active",
				runId: "run_new",
				agentKey: "agent_active",
				owner: { kind: "agent", agentKey: "agent_active" },
				lastSeq: 0,
			},
		});
		expect(debugEvents(localDispatch, "runStartedCandidate")).toEqual([
			expect.objectContaining({
				chatId: "chat_active",
				runId: "run_new",
				agentKey: "agent_active",
				stateChatId: "chat_active",
				stateStreaming: false,
			}),
		]);
		expect(debugEvents(localDispatch, "runActivationAttached")).toEqual([
			expect.objectContaining({
				chatId: "chat_active",
				runId: "run_new",
				agentKey: "agent_active",
				stateChatId: "chat_active",
				stateRunId: "run_old",
				stateStreaming: false,
			}),
		]);
		expect(
			dispatched.filter((event) => event.type === "agent:attach-run"),
		).toEqual([
			{
				type: "agent:attach-run",
				detail: {
					chatId: "chat_active",
					runId: "run_new",
					agentKey: "agent_active",
					owner: { kind: "agent", agentKey: "agent_active" },
					lastSeq: 0,
				},
			},
		]);

		cleanupActivation();
	});

	it("attaches a same-chat background run when state.streaming is stale but the active session is terminal", async () => {
		const initialState = createState({
			accessToken: "token_local",
			chatId: "chat_active",
			runId: "run_old",
			streaming: true,
			chatAgentById: new Map([["chat_active", "agent_active"]]),
		});
		const stateRef = { current: initialState };
		const localDispatch = jest.fn<void, [AppAction]>((action) => {
			stateRef.current = appReducer(stateRef.current, action);
		});
		const session = createLiveQuerySession({
			requestId: "req_old",
			chatId: "chat_active",
			agentKey: "agent_active",
		});
		session.runId = "run_old";
		session.streaming = false;
		session.abortController = null;
		const querySessionsRef = { current: new Map([["req_old", session]]) };
		const activeQuerySessionRequestIdRef = { current: "req_old" };
		const listeners = new Map<string, Set<(event: Event) => void>>();
		const dispatched: Array<{ type: string; detail: unknown }> = [];
		class MockCustomEvent {
			type: string;
			detail: unknown;

			constructor(type: string, init?: { detail?: unknown }) {
				this.type = type;
				this.detail = init?.detail;
			}
		}
		Object.defineProperty(globalThis, "window", {
			value: {
				location: { pathname: "/agent/agent_active" },
				addEventListener: jest.fn((type: string, listener: (event: Event) => void) => {
					const current = listeners.get(type) || new Set();
					current.add(listener);
					listeners.set(type, current);
				}),
				removeEventListener: jest.fn((type: string, listener: (event: Event) => void) => {
					listeners.get(type)?.delete(listener);
				}),
				dispatchEvent: jest.fn((event: Event): boolean => {
					dispatched.push({
						type: event.type,
						detail: (event as CustomEvent).detail,
					});
					for (const listener of listeners.get(event.type) || []) {
						listener(event);
					}
					return true;
				}),
			},
			configurable: true,
			writable: true,
		});
		Object.defineProperty(globalThis, "CustomEvent", {
			value: MockCustomEvent,
			configurable: true,
			writable: true,
		});
		const cleanupActivation = registerMainChatRunActivationListener({
			dispatch: localDispatch,
			stateRef,
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			handledRunKeysRef: { current: new Set() },
		});

		const onPush = createConversationPushHandler({
			dispatch: localDispatch,
			stateRef,
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "run.started",
			payload: {
				chatId: "chat_active",
				runId: "run_new",
				agentKey: "agent_active",
			},
		}) as WsPushFrame);

		expect(debugEvents(localDispatch, "runStartedCandidate")).toEqual([
			expect.objectContaining({
				chatId: "chat_active",
				runId: "run_new",
				agentKey: "agent_active",
				stateChatId: "chat_active",
				stateRunId: "run_old",
				stateStreaming: true,
				activeRequestId: "req_old",
				activeSessionRunId: "run_old",
				activeSessionStreaming: false,
			}),
		]);
		expect(debugEvents(localDispatch, "runActivationAttached")).toEqual([
			expect.objectContaining({
				chatId: "chat_active",
				runId: "run_new",
				agentKey: "agent_active",
				reason: "stale_state_streaming_ignored",
				stateChatId: "chat_active",
				stateRunId: "run_old",
				stateStreaming: true,
				activeRequestId: "req_old",
				activeSessionRunId: "run_old",
				activeSessionStreaming: false,
			}),
		]);
		expect(
			dispatched.filter((event) => event.type === "agent:attach-run"),
		).toEqual([
			{
				type: "agent:attach-run",
				detail: {
					chatId: "chat_active",
					runId: "run_new",
					agentKey: "agent_active",
					owner: { kind: "agent", agentKey: "agent_active" },
					lastSeq: 0,
				},
			},
		]);

		cleanupActivation();
	});

	it("updates the active chat summary from chat.updated pushes without reloading the chat", async () => {
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

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "chat.updated",
			payload: {
				chatId: "chat_active",
				lastRunContent: "updated elsewhere",
			},
		}) as WsPushFrame);

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_active",
				lastRunContent: "updated elsewhere",
			}),
		});
		expect(dispatchEvent).not.toHaveBeenCalled();
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("updates chat read state and agent unread counts from chat.read/chat.unread push frames", async () => {
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

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "chat.read",
			payload: {
				chatId: "chat_1",
				agentKey: "agent_alpha",
				lastRunId: "run_1",
				readAt: EPOCH_MS + 111,
				readRunId: "run_1",
				agentUnreadCount: 1,
			},
		}) as WsPushFrame);

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_1",
				lastRunId: "run_1",
				read: {
					isRead: true,
					readAt: EPOCH_MS + 111,
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

		onPush(withPushContractTime({
			frame: "push",
			type: "chat.unread",
			payload: {
				chatId: "chat_1",
				agentKey: "agent_alpha",
				lastRunId: "run_2",
				createdAt: EPOCH_MS + 222,
				readRunId: "",
				agentUnreadCount: 2,
			},
		}) as WsPushFrame);

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_1",
				lastRunId: "run_2",
				read: {
					isRead: false,
				},
				updatedAt: EPOCH_MS + 222,
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

	it("upserts run.finished and clears the matching active run observation without reloading the chat", async () => {
		const abortController = new AbortController();
		const state = createState({
			accessToken: "token_local",
			chatId: "chat_active",
			runId: "run_done",
			streaming: true,
			abortController,
			currentChatActiveRun: {
				chatId: "chat_active",
				runId: "run_done",
				agentKey: "agent_active",
			},
		});
		const session = createLiveQuerySession({
			requestId: "req_done",
			chatId: "chat_active",
			agentKey: "agent_active",
		});
		session.runId = "run_done";
		session.streaming = true;
		session.abortController = abortController;
		const querySessionsRef = { current: new Map([["req_done", session]]) };
		const activeQuerySessionRequestIdRef = { current: "req_done" };
		const abortActiveAttach = jest.fn();
		const activeAttachRef = {
			current: {
				requestId: "req_done",
				runId: "run_done",
				chatId: "chat_active",
				agentKey: "agent_active",
				controller: abortController,
				abort: abortActiveAttach,
			},
		};
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

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			activeAttachRef,
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "run.finished",
			payload: {
				chatId: "chat_active",
				runId: "run_done",
				finishedAt: EPOCH_MS + 40,
			},
		}) as WsPushFrame);

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_active",
				lastRunId: "run_done",
				updatedAt: EPOCH_MS + 40,
			}),
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_CURRENT_CHAT_ACTIVE_RUN",
			activeRun: null,
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_STREAMING",
			streaming: false,
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "SET_ABORT_CONTROLLER",
			controller: null,
		});
		expect(session.streaming).toBe(false);
		expect(session.abortController).toBeNull();
		expect(abortActiveAttach).toHaveBeenCalledTimes(1);
		expect(activeAttachRef.current).toBeNull();
		expect(debugEvents(dispatch, "runObservationReleased")).toEqual([
			expect.objectContaining({
				chatId: "chat_active",
				runId: "run_done",
				reason: "terminal_push",
				stateChatId: "chat_active",
				stateRunId: "run_done",
				stateStreaming: true,
			}),
		]);
		expect(dispatchEvent).not.toHaveBeenCalled();
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("does not unlock the current observation when run.finished is for another run", async () => {
		const abortController = new AbortController();
		const state = createState({
			accessToken: "token_local",
			chatId: "chat_active",
			runId: "run_current",
			streaming: true,
			abortController,
			currentChatActiveRun: {
				chatId: "chat_active",
				runId: "run_current",
				agentKey: "agent_active",
			},
		});
		const session = createLiveQuerySession({
			requestId: "req_current",
			chatId: "chat_active",
			agentKey: "agent_active",
		});
		session.runId = "run_current";
		session.streaming = true;
		session.abortController = abortController;
		const querySessionsRef = { current: new Map([["req_current", session]]) };
		const activeQuerySessionRequestIdRef = { current: "req_current" };
		const abortActiveAttach = jest.fn();
		const activeAttachRef = {
			current: {
				requestId: "req_current",
				runId: "run_current",
				chatId: "chat_active",
				agentKey: "agent_active",
				controller: abortController,
				abort: abortActiveAttach,
			},
		};

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			activeAttachRef,
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "run.finished",
			payload: {
				chatId: "chat_active",
				runId: "run_other",
			},
		}) as WsPushFrame);

		expect(dispatch).not.toHaveBeenCalledWith({
			type: "SET_STREAMING",
			streaming: false,
		});
		expect(dispatch).not.toHaveBeenCalledWith({
			type: "SET_ABORT_CONTROLLER",
			controller: null,
		});
		expect(session.streaming).toBe(true);
		expect(session.abortController).toBe(abortController);
		expect(abortActiveAttach).not.toHaveBeenCalled();
		expect(activeAttachRef.current?.runId).toBe("run_current");
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("does not reload the active chat after a streamed run.error is followed by finish and update pushes", async () => {
		const state = createState({
			accessToken: "token_local",
			chatId: "chat_active",
			events: [
				{
					type: "run.error",
					chatId: "chat_active",
					runId: "run_failed",
					error: {
						category: "runtime",
						code: "stream_failed",
						message: "api key quota exhausted",
					},
				},
			] as AgentEvent[],
		});
		const dispatchEvent = jest.fn();
		Object.defineProperty(globalThis, "window", {
			value: { dispatchEvent },
			configurable: true,
			writable: true,
		});

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "run.finished",
			payload: {
				chatId: "chat_active",
				runId: "run_failed",
			},
		}) as WsPushFrame);
		onPush(withPushContractTime({
			frame: "push",
			type: "chat.updated",
			payload: {
				chatId: "chat_active",
				lastRunId: "run_failed",
				lastRunContent: "",
				updatedAt: 1781588217376,
			},
		}) as WsPushFrame);

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_active",
				lastRunId: "run_failed",
			}),
		});
		expect(dispatchEvent).not.toHaveBeenCalled();
		expect(handleEvent).not.toHaveBeenCalled();
	});

	it("prefers top-level push fields over payload fields when both are present", async () => {
		const state = createState({ accessToken: "token_local" });

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "run.started",
			chatId: "chat_top",
			runId: "run_top",
			payload: {
				chatId: "chat_payload",
				runId: "run_payload",
			},
		}) as WsPushFrame);

		expect(dispatch).toHaveBeenCalledWith({
			type: "UPSERT_CHAT",
			chat: expect.objectContaining({
				chatId: "chat_top",
				lastRunId: "run_top",
			}),
		});
	});

	it("prefers top-level push fields over nested data fields when both are present", async () => {
		const state = createState({ accessToken: "token_local" });

		const onPush = createConversationPushHandler({
			dispatch,
			stateRef: { current: state },
			handleEvent,
			ensureAccessTokenImpl: jest.fn(),
		});

		onPush(withPushContractTime({
			frame: "push",
			type: "chat.created",
			chatId: "chat_top_data",
			chatName: "Top Level Name",
			data: {
				chatId: "chat_nested_data",
				chatName: "Nested Name",
				agentKey: "agent_nested",
			},
		}) as WsPushFrame);

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
