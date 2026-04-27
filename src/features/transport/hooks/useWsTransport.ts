import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import type { AppAction } from "@/app/state/AppContext";
import { useAppContext } from "@/app/state/AppContext";
import type { AgentEvent, AppState, Chat } from "@/app/state/types";
import { ensureAccessToken } from "@/shared/api/apiClient";
import { setTransportModeProvider } from "@/features/transport/lib/apiClientProxy";
import { markDebugEventHidden } from "@/features/timeline/lib/debugEventDisplay";
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
	describeWsConnectionFailure,
	toWsConnectionError,
	type WsClient,
} from "@/features/transport/lib/wsClient";
import {
	createLiveQuerySession,
	type LiveQuerySession,
} from "@/features/chats/lib/conversationSession";
import { readEventTeamId } from "@/shared/utils/eventFieldReaders";
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

function dispatchLoadChatEvent(chatId: string): void {
	if (
		typeof window === "undefined"
		|| typeof window.dispatchEvent !== "function"
		|| typeof CustomEvent !== "function"
	) {
		return;
	}
	window.dispatchEvent(
		new CustomEvent("agent:load-chat", {
			detail: { chatId },
		}),
	);
}

function dispatchAttachRunEvent(chatId: string, runId: string, lastSeq = 0): void {
	if (
		typeof window === "undefined"
		|| typeof window.dispatchEvent !== "function"
		|| typeof CustomEvent !== "function"
	) {
		return;
	}
	window.dispatchEvent(
		new CustomEvent("agent:attach-run", {
			detail: { chatId, runId, lastSeq },
		}),
	);
}

type ActiveAttachState = {
	requestId: string;
	runId: string;
	chatId: string;
	controller: AbortController;
	abort: () => void;
};

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
		const lastSeqRaw = Number(detail?.lastSeq ?? 0);
		const lastSeq = Number.isFinite(lastSeqRaw) && lastSeqRaw >= 0 ? lastSeqRaw : 0;
		if (!runId || !chatId) {
			return;
		}
		const current = options.activeAttachRef.current;
		if (current && current.runId === runId && current.chatId === chatId) {
			return;
		}

		current?.abort();

		const wsClient = getWsClientImpl();
		if (!wsClient) {
			return;
		}

		const controller = new AbortController();
		let session: LiveQuerySession | null = null;
		const attachHandleEvent = (attachedEvent: AgentEvent) => {
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
		const stream = wsClient.attachRun(
			runId,
			lastSeq,
			attachHandleEvent,
			(_reason, _lastSeq) => {
				cleanupActiveAttach(stream.requestId);
			},
			controller.signal,
		);
		session = createLiveQuerySession({
			requestId: stream.requestId,
			chatId,
		});
		session.runId = runId;
		session.streaming = true;
		session.abortController = controller;
		options.querySessionsRef.current.set(stream.requestId, session);
		options.chatQuerySessionIndexRef.current.set(chatId, stream.requestId);
		options.activeQuerySessionRequestIdRef.current = stream.requestId;
		options.activeAttachRef.current = {
			requestId: stream.requestId,
			runId,
			chatId,
			controller,
			abort: stream.abort,
		};
		options.dispatch({ type: "SET_RUN_ID", runId });
		options.dispatch({ type: "SET_REQUEST_ID", requestId: stream.requestId });
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
		options.activeAttachRef.current?.abort();
		options.activeAttachRef.current = null;
	};
}

function buildWsClient(
	options: ConnectWsTransportOptions,
	accessToken: string,
): WsClient {
	const initWsClientImpl = options.initWsClientImpl ?? initWsClient;
	return initWsClientImpl({
		accessToken,
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

			if (type === "run.start") {
				upsertPushChatSummary(options.dispatch, liveEvent);
				if (options.stateRef.current.streaming) {
					return;
				}
				if (isActiveChat) {
					const runId = String(liveEvent.runId || "").trim();
					if (runId) {
						dispatchAttachRunEvent(eventChatId, runId, 0);
					}
				}
				return;
			}

			if (type === "run.complete") {
				upsertPushChatSummary(options.dispatch, liveEvent);
				if (options.stateRef.current.streaming) {
					return;
				}
				if (isActiveChat) {
					dispatchLoadChatEvent(eventChatId);
				}
				return;
			}

			if (type === "awaiting.ask" || type === "awaiting.answer") {
				upsertPushChatSummary(options.dispatch, liveEvent);
				if (!isActiveChat) {
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
	const activeAttachRef = useRef<ActiveAttachState | null>(null);

	useEffect(() => {
		setTransportModeProvider(() => stateRef.current.transportMode);
		return () => {
			setTransportModeProvider(() => "ws");
		};
	}, [state.transportMode, stateRef]);

	useEffect(() => {
		if (state.transportMode !== "ws") {
			activeAttachRef.current?.abort();
			activeAttachRef.current = null;
			return;
		}

		return registerAttachRunListener({
			dispatch,
			stateRef,
			handleEvent,
			activeAttachRef,
			querySessionsRef,
			chatQuerySessionIndexRef,
			activeQuerySessionRequestIdRef,
		});
	}, [
		activeQuerySessionRequestIdRef,
		chatQuerySessionIndexRef,
		dispatch,
		handleEvent,
		querySessionsRef,
		state.transportMode,
		stateRef,
	]);

	useEffect(() => {
		if (state.transportMode !== "ws") {
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
			state,
			stateRef,
			handleEvent,
			isCancelled: () => cancelled,
		}).catch((error) => {
			if (cancelled) {
				return;
			}
			if ((error as { wsReported?: boolean } | null)?.wsReported) {
				return;
			}
			const normalized = toWsConnectionError(error, {
				appMode: isAppMode(),
				hasAccessToken: Boolean(
					String(stateRef.current.accessToken || state.accessToken || "").trim(),
				),
			});
			dispatch({ type: "SET_WS_ERROR_MESSAGE", message: normalized.message });
			dispatch({ type: "SET_WS_STATUS", status: "error" });
			appendWsDebug(dispatch, `[live] ${normalized.message}`);
		});

		return () => {
			cancelled = true;
			activeAttachRef.current?.abort();
			activeAttachRef.current = null;
			scheduleDestroyWsClient();
			dispatch({ type: "SET_WS_ERROR_MESSAGE", message: "" });
			dispatch({ type: "SET_WS_STATUS", status: "disconnected" });
		};
	}, [dispatch, handleEvent, state.accessToken, state.transportMode, stateRef]);
}
