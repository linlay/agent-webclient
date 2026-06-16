import { useCallback, useEffect, useRef } from "react";
import type { Dispatch } from "react";
import type { AppAction } from "@/app/state/AppContext";
import { useAppContext } from "@/app/state/AppContext";
import {
	isAwaitingAnswerPushEvent,
	isAwaitingAskPushEvent,
	type AgentEvent,
	type AppState,
	type Chat,
} from "@/app/state/types";
import { ensureAccessToken } from "@/shared/api/apiClient";
import { markDebugEventHidden } from "@/features/timeline/lib/debugEventDisplay";
import { resolveChatSummaryActiveRun } from "@/features/chats/lib/chatRunState";
import {
	resolveChatSummaryPendingAwaiting,
	resolveChatSummaryUpdatedAt,
} from "@/features/chats/lib/chatSummaryLive";
import {
	normalizeChatReadState,
	upsertAgentUnreadCount,
} from "@/features/chats/lib/chatReadState";
import { isAppMode } from "@/shared/utils/routing";
import {
	destroyWsClient,
	getWsClient,
	initWsClient,
	scheduleDestroyWsClient,
} from "@/features/transport/lib/wsClientSingleton";
import { useAgentEventHandler } from "@/features/timeline/hooks/useAgentEventHandler";
import {
	createWsFrameId,
	describeWsConnectionFailure,
	isWsConnectionFailure,
	toWsConnectionError,
	type WsClient,
} from "@/features/transport/lib/wsClient";
import {
	WS_STREAM_RETRY_DELAYS_MS,
	handleStreamReplayError,
} from "@/features/transport/lib/wsStreamReplay";
import {
	AGENT_DETACH_RUN_EVENT,
	type DetachRunReason,
} from "@/features/transport/lib/detachRunEvent";
import {
	createLiveQuerySession,
	type LiveQuerySession,
} from "@/features/chats/lib/conversationSession";
import { resolveRunAgentKey } from "@/features/chats/lib/runAgentIdentity";
import { normalizeTimelineAttachments } from "@/features/artifacts/lib/timelineAttachments";
import {
	readEventTeamId,
	readRequestQueryText,
} from "@/shared/utils/eventFieldReaders";
import { toText } from "@/shared/utils/eventUtils";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === "object";
}

function normalizePushType(type: string): string {
	if (type === "run.started") {
		return "run.start";
	}
	if (type === "run.finished") {
		return "run.complete";
	}
	return type;
}

function toPushEvent(frame: {
	type?: string;
	payload?: unknown;
	data?: unknown;
	[key: string]: unknown;
}): AgentEvent {
	const nestedRecord = isObjectRecord(frame.payload)
		? frame.payload
		: isObjectRecord(frame.data)
			? frame.data
			: {};
	const { frame: _frame, payload: _payload, data: _data, ...topLevel } = frame;
	const normalizedType = normalizePushType(
		String(frame.type || nestedRecord.type || ""),
	);
	return {
		...nestedRecord,
		...topLevel,
		type: normalizedType,
	} as AgentEvent;
}

function toChatPatchFromPushEvent(
	event: AgentEvent,
): (Partial<Chat> & Pick<Chat, "chatId">) | null {
	const chatId = String(event.chatId || "").trim();
	if (!chatId) {
		return null;
	}

	const raw = event as Record<string, unknown>;
	const chatPatch: Partial<Chat> & Pick<Chat, "chatId"> = {
		chatId,
		updatedAt: resolveChatSummaryUpdatedAt(event),
	};
	const hasPendingAwaiting = resolveChatSummaryPendingAwaiting(event);
	if (hasPendingAwaiting !== undefined) {
		chatPatch.hasPendingAwaiting = hasPendingAwaiting;
		if (hasPendingAwaiting) {
			const mode = String(raw.mode || '').trim();
			if (mode) {
				chatPatch.awaiting = { mode };
			}
		}
	}

	const chatName = String(raw.chatName || "").trim();
	if (chatName) {
		chatPatch.chatName = chatName;
	}

	const firstAgentName = String(raw.firstAgentName || "").trim();
	if (firstAgentName) {
		chatPatch.firstAgentName = firstAgentName;
	}

	const agentKey = String(event.agentKey || raw.firstAgentKey || "").trim();
	if (agentKey) {
		chatPatch.agentKey = agentKey;
		chatPatch.firstAgentKey = agentKey;
	}

	const teamId = String(raw.teamId || "").trim();
	if (teamId) {
		chatPatch.teamId = teamId;
	}

	const runId = String(event.runId || raw.lastRunId || "").trim();
	if (runId) {
		chatPatch.lastRunId = runId;
	}
	const hasActiveRun = resolveChatSummaryActiveRun(event);
	if (hasActiveRun !== undefined) {
		chatPatch.hasActiveRun = hasActiveRun;
		chatPatch.activeRun = hasActiveRun
			? {
					runId,
					...(agentKey ? { agentKey } : {}),
				}
			: null;
	}

	if (event.type === "chat.read" || event.type === "chat.unread") {
		const nextReadState = normalizeChatReadState({
			isRead: event.type === "chat.read",
			readAt: raw.readAt,
			readRunId: raw.readRunId,
		});
		if (nextReadState) {
			chatPatch.read = nextReadState;
		}
	}

	const lastRunContent = typeof raw.lastRunContent === "string"
		? raw.lastRunContent
		: typeof event.text === "string"
			? event.text
			: typeof event.message === "string"
				? event.message
				: "";
	if (lastRunContent.trim()) {
		chatPatch.lastRunContent = lastRunContent;
	}

	return chatPatch;
}

type WsTransportDispatch = Dispatch<AppAction>;

interface ConnectWsTransportOptions {
	dispatch: WsTransportDispatch;
	state: Pick<AppState, "accessToken">;
	stateRef: { current: AppState };
	handleEvent: (event: AgentEvent) => void;
	isCancelled?: () => boolean;
	ensureAccessTokenImpl?: typeof ensureAccessToken;
	isAppModeImpl?: typeof isAppMode;
	initWsClientImpl?: typeof initWsClient;
	destroyWsClientImpl?: typeof destroyWsClient;
}

function appendWsDebug(dispatch: WsTransportDispatch, line: string): void {
	dispatch({ type: "APPEND_DEBUG", line });
}

function setWsError(
	dispatch: WsTransportDispatch,
	message: string,
	status: AppState["wsStatus"] = "error",
): Error {
	dispatch({ type: "SET_WS_ERROR_MESSAGE", message });
	dispatch({ type: "SET_WS_STATUS", status });
	appendWsDebug(dispatch, `[live] ${message}`);
	const error = new Error(message) as Error & { wsReported?: boolean };
	error.wsReported = true;
	return error;
}

function upsertPushChatSummary(
	dispatch: WsTransportDispatch,
	event: AgentEvent,
): void {
	const chatPatch = toChatPatchFromPushEvent(event);
	if (!chatPatch) {
		return;
	}
	dispatch({ type: "UPSERT_CHAT", chat: chatPatch });
}

function syncAgentUnreadCountFromPush(
	dispatch: WsTransportDispatch,
	stateRef: { current: AppState },
	event: AgentEvent,
): void {
	const raw = event as Record<string, unknown>;
	const agentKey = String(event.agentKey || "").trim();
	const agentUnreadCount = Number(raw.agentUnreadCount);
	if (!agentKey || !Number.isFinite(agentUnreadCount) || agentUnreadCount < 0) {
		return;
	}

	const nextAgents = upsertAgentUnreadCount(
		stateRef.current.agents,
		agentKey,
		agentUnreadCount,
	);
	if (nextAgents === stateRef.current.agents) {
		return;
	}
	dispatch({ type: "SET_AGENTS", agents: nextAgents });
}

function dispatchAttachRunEvent(chatId: string, runId: string, lastSeq = 0, agentKey = ""): void {
	if (
		typeof window === "undefined"
		|| typeof window.dispatchEvent !== "function"
		|| typeof CustomEvent !== "function"
	) {
		return;
	}
	window.dispatchEvent(
		new CustomEvent("agent:attach-run", {
			detail: { chatId, runId, lastSeq, agentKey },
		}),
	);
}

type ActiveAttachState = {
	requestId: string;
	runId: string;
	chatId: string;
	agentKey: string;
	controller: AbortController;
	abort: () => void;
};

interface DetachRunResponse {
	accepted?: boolean;
	status?: string;
	runId?: string;
	detail?: string;
}

type DetachRunDetail = {
	chatId?: unknown;
	runId?: unknown;
	agentKey?: unknown;
	reason?: unknown;
};

interface RequestWsDetachRunOptions {
	dispatch: WsTransportDispatch;
	stateRef: { current: AppState };
	querySessionsRef: { current: Map<string, LiveQuerySession> };
	activeQuerySessionRequestIdRef: { current: string };
	getWsClientImpl?: typeof getWsClient;
	logMissing?: boolean;
}

function resolveAttachAgentKey(
	state: AppState,
	chatId: string,
	runId: string,
	detail?: Record<string, unknown>,
): string {
	return resolveRunAgentKey({
		runId,
		agentKey: detail?.agentKey,
		currentRunAgentKey: state.currentRunAgentKey,
		runAgentById: state.runAgentById,
		chatId,
		chatAgentById: state.chatAgentById,
		chats: state.chats,
	});
}

function normalizeDetachReason(value: unknown): DetachRunReason {
	const reason = toText(value);
	return reason === "new_conversation"
		|| reason === "page_leave"
		|| reason === "transport_cleanup"
		|| reason === "attach_switch"
		? reason
		: "chat_switch";
}

function resolveDetachRunTarget(
	options: RequestWsDetachRunOptions,
	detail: DetachRunDetail = {},
): { chatId: string; runId: string; agentKey: string; reason: DetachRunReason } | null {
	const state = options.stateRef.current;
	const activeRequestId = toText(options.activeQuerySessionRequestIdRef.current);
	const session = activeRequestId
		? options.querySessionsRef.current.get(activeRequestId) || null
		: null;
	const chatId =
		toText(detail.chatId)
		|| toText(session?.chatId)
		|| toText(state.chatId);
	const runId =
		toText(detail.runId)
		|| toText(session?.runId)
		|| toText(state.runId);
	if (!runId) {
		return null;
	}
	const agentKey = resolveRunAgentKey({
		runId,
		agentKey: detail.agentKey || session?.agentKey,
		currentRunAgentKey: state.currentRunAgentKey,
		runAgentById: state.runAgentById,
		chatId,
		chatAgentById: state.chatAgentById,
		chats: state.chats,
	});
	if (!agentKey) {
		return null;
	}
	return {
		chatId,
		runId,
		agentKey,
		reason: normalizeDetachReason(detail.reason),
	};
}

function requestWsDetachRun(
	options: RequestWsDetachRunOptions,
	detail: DetachRunDetail = {},
): void {
	const getWsClientImpl = options.getWsClientImpl ?? getWsClient;
	const target = resolveDetachRunTarget(options, detail);
	if (!target) {
		if (options.logMissing) {
			appendWsDebug(
				options.dispatch,
				`[ws detach] skipped: missing runId or agentKey (chatId=${toText(detail.chatId) || "-"})`,
			);
		}
		return;
	}

	const wsClient = getWsClientImpl();
	if (!wsClient) {
		appendWsDebug(
			options.dispatch,
			`[ws detach] skipped: WebSocket client unavailable (runId=${target.runId})`,
		);
		return;
	}

	void wsClient.request<DetachRunResponse>({
		type: "/api/detach",
		payload: {
			runId: target.runId,
			agentKey: target.agentKey,
			reason: target.reason,
		},
	}).then((response) => {
		const data = (response.data || {}) as DetachRunResponse;
		const status = toText(data.status);
		if (data.accepted === false && status && status !== "not_observing") {
			appendWsDebug(
				options.dispatch,
				`[ws detach] ${target.runId}: ${status}`,
			);
		}
	}).catch((error) => {
		appendWsDebug(
			options.dispatch,
			`[ws detach error] ${(error as Error).message}`,
		);
	});
}

interface RegisterAttachRunListenerOptions {
	dispatch: WsTransportDispatch;
	stateRef: { current: AppState };
	handleEvent: (event: AgentEvent) => void;
	activeAttachRef: { current: ActiveAttachState | null };
	querySessionsRef: { current: Map<string, LiveQuerySession> };
	chatQuerySessionIndexRef: { current: Map<string, string> };
	activeQuerySessionRequestIdRef: { current: string };
	getWsClientImpl?: typeof getWsClient;
}

function isAttachTerminalRunEventType(type: string): boolean {
	return type === "run.error" || type === "run.complete" || type === "run.cancel";
}

function bindAttachSessionIdentity(session: LiveQuerySession, event: AgentEvent): void {
	const nextChatId = toText(event.chatId);
	if (nextChatId) {
		session.chatId = nextChatId;
	}
	const nextRunId = toText(event.runId);
	if (nextRunId) {
		session.runId = nextRunId;
	}
	const nextAgentKey = toText(event.agentKey);
	if (nextAgentKey) {
		session.agentKey = nextAgentKey;
	}
	const nextTeamId = readEventTeamId(event);
	if (nextTeamId) {
		session.teamId = nextTeamId;
	}
}

function renderAttachedRequestQuery(
	options: RegisterAttachRunListenerOptions,
	event: AgentEvent,
): void {
	if (toText(event.type) !== "request.query") {
		return;
	}

	const text = readRequestQueryText(event);
	const attachments = normalizeTimelineAttachments(
		(event as Record<string, unknown>).references,
	);
	if (!text && attachments.length === 0) {
		return;
	}

	const requestId = toText(event.requestId);
	const nodeId = `user_${requestId || toText(event.seq) || Date.now()}`;
	if (options.stateRef.current.timelineNodes.has(nodeId)) {
		return;
	}

	options.dispatch({
		type: "SET_TIMELINE_NODE",
		id: nodeId,
		node: {
			id: nodeId,
			kind: "message",
			role: "user",
			messageVariant: "default",
			text,
			attachments: attachments.length > 0 ? attachments : undefined,
			ts: event.timestamp || Date.now(),
		},
	});
	options.dispatch({ type: "APPEND_TIMELINE_ORDER", id: nodeId });
}

export function registerAttachRunListener(
	options: RegisterAttachRunListenerOptions,
): () => void {
	const getWsClientImpl = options.getWsClientImpl ?? getWsClient;

	const cleanupActiveAttach = (requestId: string) => {
		if (options.activeAttachRef.current?.requestId !== requestId) {
			return;
		}
		const session = options.querySessionsRef.current.get(requestId);
		if (session) {
			session.streaming = false;
			session.abortController = null;
		}
		if (options.activeQuerySessionRequestIdRef.current === requestId) {
			options.activeQuerySessionRequestIdRef.current = "";
		}
		options.activeAttachRef.current = null;
		options.dispatch({ type: "SET_STREAMING", streaming: false });
		options.dispatch({ type: "SET_ABORT_CONTROLLER", controller: null });
	};

	const handler = (event: Event) => {
		const detail = (event as CustomEvent).detail as Record<string, unknown> | undefined;
		const runId = String(detail?.runId || "").trim();
		const chatId = String(detail?.chatId || "").trim();
		const agentKey = resolveAttachAgentKey(options.stateRef.current, chatId, runId, detail);
		const lastSeqRaw = Number(detail?.lastSeq ?? 0);
		const lastSeq = Number.isFinite(lastSeqRaw) && lastSeqRaw >= 0 ? lastSeqRaw : 0;
		if (!runId || !chatId) {
			return;
		}
		if (!agentKey) {
			options.dispatch({
				type: "APPEND_DEBUG",
				line: `[ws attach] skipped: missing agentKey (chatId=${chatId}, runId=${runId})`,
			});
			return;
		}
		const current = options.activeAttachRef.current;
		if (current && current.runId === runId && current.chatId === chatId && current.agentKey === agentKey) {
			return;
		}

		const wsClient = getWsClientImpl();
		if (!wsClient) {
			return;
		}

		if (current) {
			requestWsDetachRun(
				{
					dispatch: options.dispatch,
					stateRef: options.stateRef,
					querySessionsRef: options.querySessionsRef,
					activeQuerySessionRequestIdRef: options.activeQuerySessionRequestIdRef,
					getWsClientImpl,
				},
				{
					chatId: current.chatId,
					runId: current.runId,
					agentKey: current.agentKey,
					reason: "attach_switch",
				},
			);
			current.abort();
		}

		const controller = new AbortController();
		let session: LiveQuerySession | null = null;
		const attachHandleEvent = (attachedEvent: AgentEvent) => {
			renderAttachedRequestQuery(options, attachedEvent);
			if (session) {
				session.bufferedEvents.push(attachedEvent);
				bindAttachSessionIdentity(session, attachedEvent);
				if (isAttachTerminalRunEventType(toText(attachedEvent.type))) {
					session.streaming = false;
					session.abortController = null;
				}
				if (session.chatId) {
					options.chatQuerySessionIndexRef.current.set(
						session.chatId,
						session.requestId,
					);
				}
			}
			options.handleEvent(attachedEvent);
		};
		const requestId = createWsFrameId("wsstream");
		session = createLiveQuerySession({
			requestId,
			chatId,
		});
		session.runId = runId;
		session.agentKey = agentKey;
		session.streaming = true;
		session.abortController = controller;

		let receivedServerActivity = false;
		const retryCount = { current: 0 };
		const abortFns: Array<() => void> = [];
		const startAttachStream = () => {
			const streamResult = wsClient.stream({
				type: "/api/attach",
				payload: {
					runId,
					agentKey,
					lastSeq,
				},
				signal: controller.signal,
				onEvent: (attachedEvent) => {
					receivedServerActivity = true;
					attachHandleEvent(attachedEvent);
				},
				onFrame: (_rawFrame) => {
					receivedServerActivity = true;
				},
				onError: (error) => {
					const handled = handleStreamReplayError(
						error,
						receivedServerActivity,
						{
							signal: controller.signal,
							retryDelaysMs: WS_STREAM_RETRY_DELAYS_MS,
							getRetryClient: async () => wsClient,
							startStreamAttempt: () => {
								startAttachStream();
							},
						},
						retryCount,
						(finalError) => {
							if (finalError.name === "AbortError") {
								cleanupActiveAttach(requestId);
								return;
							}
							cleanupActiveAttach(requestId);
						},
					);

					if (!handled) {
						if (error.name === "AbortError") {
							cleanupActiveAttach(requestId);
							return;
						}
						cleanupActiveAttach(requestId);
					}
				},
				onDone: (reason, _lastSeq) => {
					cleanupActiveAttach(requestId);
				},
				requestId,
			});
			abortFns.push(streamResult.abort);
		};

		startAttachStream();

		options.querySessionsRef.current.set(requestId, session);
		options.chatQuerySessionIndexRef.current.set(chatId, requestId);
		options.activeQuerySessionRequestIdRef.current = requestId;
		options.activeAttachRef.current = {
			requestId,
			runId,
			chatId,
			agentKey,
			controller,
			abort: () => {
				for (const fn of abortFns) {
					fn();
				}
				controller.abort();
			},
		};
		options.dispatch({ type: "SET_RUN_ID", runId });
		options.dispatch({ type: "SET_RUN_AGENT_BY_ID", runId, agentKey });
		options.dispatch({ type: "SET_CURRENT_RUN_AGENT_KEY", agentKey });
		options.dispatch({ type: "SET_REQUEST_ID", requestId });
		options.dispatch({ type: "SET_STREAMING", streaming: true });
		options.dispatch({ type: "SET_ABORT_CONTROLLER", controller });
	};

	if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
		window.addEventListener("agent:attach-run", handler);
	}

	return () => {
		if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
			window.removeEventListener("agent:attach-run", handler);
		}
		const current = options.activeAttachRef.current;
		if (current) {
			requestWsDetachRun(
				{
					dispatch: options.dispatch,
					stateRef: options.stateRef,
					querySessionsRef: options.querySessionsRef,
					activeQuerySessionRequestIdRef: options.activeQuerySessionRequestIdRef,
					getWsClientImpl,
				},
				{
					chatId: current.chatId,
					runId: current.runId,
					agentKey: current.agentKey,
					reason: "transport_cleanup",
				},
			);
			current.abort();
		}
		options.activeAttachRef.current = null;
	};
}

export function registerDetachRunListener(
	options: RequestWsDetachRunOptions,
): () => void {
	const handler = (event: Event) => {
		const detail = (event as CustomEvent).detail as DetachRunDetail | undefined;
		requestWsDetachRun(options, detail || {});
	};

	if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
		window.addEventListener(AGENT_DETACH_RUN_EVENT, handler);
	}

	return () => {
		if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
			window.removeEventListener(AGENT_DETACH_RUN_EVENT, handler);
		}
	};
}

function buildWsClient(
	options: ConnectWsTransportOptions,
	accessToken: string,
): WsClient {
	const initWsClientImpl = options.initWsClientImpl ?? initWsClient;
	const ensureAccessTokenImpl =
		options.ensureAccessTokenImpl ?? ensureAccessToken;
	const appMode = (options.isAppModeImpl ?? isAppMode)();
	const currentStateToken = () =>
		String(options.stateRef.current.accessToken || options.state.accessToken || "")
			.trim();
	const syncToken = (token: string) => {
		const normalized = String(token || "").trim();
		if (normalized && normalized !== currentStateToken()) {
			options.dispatch({ type: "SET_ACCESS_TOKEN", token: normalized });
		}
		return normalized || currentStateToken();
	};
	return initWsClientImpl({
		accessToken,
		resolveAccessToken: async (reason) => {
			if (!appMode) {
				return currentStateToken();
			}
			return syncToken(await ensureAccessTokenImpl(reason));
		},
		onStatusChange: (status) => {
			options.dispatch({ type: "SET_WS_STATUS", status });
		},
		onPush: (frame) => {
			const liveEvent = toPushEvent(frame);
			markDebugEventHidden(liveEvent);
			const type = String(liveEvent.type || "");
			const currentChatId = String(options.stateRef.current.chatId || "").trim();
			const eventChatId = String(liveEvent.chatId || "").trim();
			const isActiveChat = Boolean(
				currentChatId && eventChatId && eventChatId === currentChatId,
			);

			if (type === "heartbeat") {
				return;
			}

			if (type === "live.connected") {
				appendWsDebug(
					options.dispatch,
					"[live] Connected to relay live stream via WebSocket push",
				);
				return;
			}

			if (type === "chat.created") {
				upsertPushChatSummary(options.dispatch, liveEvent);
				return;
			}

			if (type === "chat.read" || type === "chat.unread") {
				upsertPushChatSummary(options.dispatch, liveEvent);
				syncAgentUnreadCountFromPush(options.dispatch, options.stateRef, liveEvent);
				return;
			}

			if (type === "chat.read_all") {
				const agentKey = String(liveEvent.agentKey || "").trim();
				if (agentKey) {
					options.dispatch({ type: "MARK_AGENT_CHATS_READ", agentKey });
				}
				return;
			}

			if (type === "chat.deleted") {
				const deletedChatId = String(liveEvent.chatId || "").trim();
				if (deletedChatId) {
					options.dispatch({ type: "CHAT_DELETED", chatId: deletedChatId });
					if (deletedChatId === currentChatId) {
						options.dispatch({ type: "SET_CHAT_ID", chatId: "" });
						options.dispatch({ type: "SET_RUN_ID", runId: "" });
						options.dispatch({ type: "RESET_ACTIVE_CONVERSATION" });
						window.dispatchEvent(new CustomEvent("agent:reset-event-cache"));
						window.dispatchEvent(new CustomEvent("agent:voice-reset"));
					}
				}
				return;
			}

			if (type === "chat.archived") {
				const archivedChatId = String(liveEvent.chatId || "").trim();
				if (archivedChatId) {
					options.dispatch({ type: "CHAT_ARCHIVED", chatId: archivedChatId });
					if (archivedChatId === currentChatId) {
						options.dispatch({ type: "SET_CHAT_ID", chatId: "" });
						options.dispatch({ type: "SET_RUN_ID", runId: "" });
						options.dispatch({ type: "RESET_ACTIVE_CONVERSATION" });
						window.dispatchEvent(new CustomEvent("agent:reset-event-cache"));
						window.dispatchEvent(new CustomEvent("agent:voice-reset"));
					}
				}
				return;
			}

			if (type === "chat.updated") {
				upsertPushChatSummary(options.dispatch, liveEvent);
				syncAgentUnreadCountFromPush(options.dispatch, options.stateRef, liveEvent);
				return;
			}

			if (type === "run.start") {
				upsertPushChatSummary(options.dispatch, liveEvent);
				if (options.stateRef.current.streaming) {
					return;
				}
				if (isActiveChat) {
					const runId = String(liveEvent.runId || "").trim();
					const agentKey = String(liveEvent.agentKey || "").trim();
					if (runId) {
						dispatchAttachRunEvent(eventChatId, runId, 0, agentKey);
					}
				}
				return;
			}

			if (type === "run.complete") {
				upsertPushChatSummary(options.dispatch, liveEvent);
				return;
			}

			const isAwaitingPushEvent =
				isAwaitingAskPushEvent(type) || isAwaitingAnswerPushEvent(type);
			if (isAwaitingPushEvent) {
				upsertPushChatSummary(options.dispatch, liveEvent);
				if (!isActiveChat) {
					return;
				}
				if (!options.stateRef.current.streaming) {
					const runId = String(liveEvent.runId || "").trim();
					const agentKey = resolveRunAgentKey({
						runId,
						agentKey: liveEvent.agentKey,
						currentRunAgentKey: options.stateRef.current.currentRunAgentKey,
						runAgentById: options.stateRef.current.runAgentById,
						chatId: eventChatId,
						chatAgentById: options.stateRef.current.chatAgentById,
						chats: options.stateRef.current.chats,
						fallbackAgentKey: "",
					});
					if (runId && agentKey) {
						dispatchAttachRunEvent(eventChatId, runId, 0, agentKey);
					} else {
						appendWsDebug(
							options.dispatch,
							`[live] awaiting push ignored without attach identity (chatId=${eventChatId || "-"}, runId=${runId || "-"})`,
						);
					}
					return;
				}
			}

			if (options.stateRef.current.streaming) {
				return;
			}

			if (currentChatId && eventChatId && eventChatId !== currentChatId) {
				return;
			}

			options.handleEvent(liveEvent);
		},
	});
}

export async function connectWsTransport(
	options: ConnectWsTransportOptions,
): Promise<void> {
	const isCancelled = options.isCancelled ?? (() => false);
	const ensureAccessTokenImpl =
		options.ensureAccessTokenImpl ?? ensureAccessToken;
	const destroyWsClientImpl =
		options.destroyWsClientImpl ?? destroyWsClient;
	const appMode = (options.isAppModeImpl ?? isAppMode)();
	const currentStateToken = () =>
		String(options.stateRef.current.accessToken || options.state.accessToken || "")
			.trim();
	const syncToken = (token: string) => {
		const normalized = String(token || "").trim();
		if (normalized && normalized !== currentStateToken()) {
			options.dispatch({ type: "SET_ACCESS_TOKEN", token: normalized });
		}
		return normalized;
	};
	const resolveToken = async (
		reason: Parameters<typeof ensureAccessToken>[0],
	): Promise<string> => {
		if (!appMode) {
			return currentStateToken();
		}
		return syncToken(await ensureAccessTokenImpl(reason));
	};

	if (isCancelled()) {
		return;
	}

	const initialToken = await resolveToken("missing");
	if (isCancelled()) {
		return;
	}

	if (!initialToken) {
		destroyWsClientImpl();
		throw setWsError(
			options.dispatch,
			describeWsConnectionFailure(new Error("missing access token"), {
				appMode,
				hasAccessToken: false,
			}),
			"disconnected",
		);
	}

	const connectClient = async (accessToken: string): Promise<void> => {
		if (isCancelled()) {
			return;
		}
		const client = buildWsClient(options, accessToken);
		await client.connect();
	};

	try {
		await connectClient(initialToken);
	} catch (error) {
		if (isCancelled()) {
			throw error;
		}
		if (!appMode) {
			throw setWsError(
				options.dispatch,
				describeWsConnectionFailure(error, {
					appMode: false,
					hasAccessToken: true,
				}),
			);
		}

		appendWsDebug(
			options.dispatch,
			"[live] Query WebSocket connect failed, retrying after token refresh",
		);
		const refreshedToken = await resolveToken("unauthorized");
		if (isCancelled()) {
			return;
		}
		if (!refreshedToken) {
			destroyWsClientImpl();
			throw setWsError(
				options.dispatch,
				describeWsConnectionFailure(new Error("missing access token"), {
					appMode: true,
					hasAccessToken: false,
				}),
				"disconnected",
			);
		}
		destroyWsClientImpl();
		try {
			await connectClient(refreshedToken);
		} catch (refreshError) {
			throw setWsError(
				options.dispatch,
				describeWsConnectionFailure(refreshError, {
					appMode: true,
					hasAccessToken: true,
				}),
			);
		}
	}
}

export function useWsTransport() {
	const {
		dispatch,
		state,
		stateRef,
		querySessionsRef,
		chatQuerySessionIndexRef,
		activeQuerySessionRequestIdRef,
	} = useAppContext();
	const { handleEvent } = useAgentEventHandler();
	const handleEventRef = useRef(handleEvent);
	const activeAttachRef = useRef<ActiveAttachState | null>(null);
	const appMode = isAppMode();
	const wsConnectKey = appMode ? "__app_mode__" : state.accessToken;

	useEffect(() => {
		handleEventRef.current = handleEvent;
	}, [handleEvent]);

	const stableHandleEvent = useCallback((event: AgentEvent) => {
		handleEventRef.current(event);
	}, []);

	useEffect(() => {
		if (state.transportMode !== "ws") {
			activeAttachRef.current?.abort();
			activeAttachRef.current = null;
			return;
		}

		return registerAttachRunListener({
			dispatch,
			stateRef,
			handleEvent: stableHandleEvent,
			activeAttachRef,
			querySessionsRef,
			chatQuerySessionIndexRef,
			activeQuerySessionRequestIdRef,
		});
	}, [
		activeQuerySessionRequestIdRef,
		chatQuerySessionIndexRef,
		dispatch,
		querySessionsRef,
		stableHandleEvent,
		state.transportMode,
		stateRef,
	]);

	useEffect(() => {
		if (state.transportMode !== "ws") {
			return;
		}

		return registerDetachRunListener({
			dispatch,
			stateRef,
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			logMissing: true,
		});
	}, [
		activeQuerySessionRequestIdRef,
		dispatch,
		querySessionsRef,
		state.transportMode,
		stateRef,
	]);

	useEffect(() => {
		if (
			state.transportMode !== "ws"
			|| typeof window === "undefined"
			|| typeof window.addEventListener !== "function"
		) {
			return;
		}
		const handler = () => {
			requestWsDetachRun(
				{
					dispatch,
					stateRef,
					querySessionsRef,
					activeQuerySessionRequestIdRef,
				},
				{ reason: "page_leave" },
			);
		};
		window.addEventListener("pagehide", handler);
		return () => window.removeEventListener("pagehide", handler);
	}, [
		activeQuerySessionRequestIdRef,
		dispatch,
		querySessionsRef,
		state.transportMode,
		stateRef,
	]);

	useEffect(() => {
		if (state.transportMode !== "ws") {
			requestWsDetachRun(
				{
					dispatch,
					stateRef,
					querySessionsRef,
					activeQuerySessionRequestIdRef,
				},
				{ reason: "transport_cleanup" },
			);
			activeAttachRef.current?.abort();
			activeAttachRef.current = null;
			destroyWsClient();
			dispatch({ type: "SET_WS_ERROR_MESSAGE", message: "" });
			dispatch({ type: "SET_WS_STATUS", status: "disconnected" });
			return;
		}

		let cancelled = false;

		void connectWsTransport({
			dispatch,
			state: { accessToken: stateRef.current.accessToken },
			stateRef,
			handleEvent: stableHandleEvent,
			isCancelled: () => cancelled,
		}).catch((error) => {
			if (cancelled) {
				return;
			}
			if ((error as { wsReported?: boolean } | null)?.wsReported) {
				return;
			}
			const normalized = toWsConnectionError(error, {
				appMode,
				hasAccessToken: Boolean(
					String(stateRef.current.accessToken || "").trim(),
				),
			});
			dispatch({ type: "SET_WS_ERROR_MESSAGE", message: normalized.message });
			dispatch({ type: "SET_WS_STATUS", status: "error" });
			appendWsDebug(dispatch, `[live] ${normalized.message}`);
		});

		return () => {
			cancelled = true;
			requestWsDetachRun(
				{
					dispatch,
					stateRef,
					querySessionsRef,
					activeQuerySessionRequestIdRef,
				},
				{ reason: "transport_cleanup" },
			);
			activeAttachRef.current?.abort();
			activeAttachRef.current = null;
			scheduleDestroyWsClient();
			dispatch({ type: "SET_WS_ERROR_MESSAGE", message: "" });
			dispatch({ type: "SET_WS_STATUS", status: "disconnected" });
		};
	}, [
		dispatch,
		activeQuerySessionRequestIdRef,
		querySessionsRef,
		stableHandleEvent,
		state.transportMode,
		stateRef,
		wsConnectKey,
	]);
}
