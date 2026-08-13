import { useCallback, useEffect, useRef } from "react";
import type { Dispatch } from "react";
import { message } from "antd";
import type { AppAction } from "@/app/state/AppContext";
import { useAppContext } from "@/app/state/AppContext";
import {
	isAwaitingAnswerPushEvent,
	isAwaitingAskPushEvent,
	type AgentEvent,
	type AppState,
	type Chat,
} from "@/app/state/types";
import { dataEndpoints, ensureAccessToken } from "@/shared/data";
import { isGatewayBackendMode } from "@/shared/config/backendMode";
import {
	runOwnerPayload,
	sameRunOwner,
	toRunOwner,
	type RunOwner,
} from "@/shared/data/runOwner";
import { markDebugEventHidden } from "@/features/events/lib/debugEventDisplay";
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
	hasValidDesktopPushTimeContract,
	readEpochMillis,
} from "@/shared/utils/platformTime";
import {
	destroyWsClient,
	getWsClient,
	initWsClient,
	scheduleDestroyWsClient,
} from "@/features/transport/lib/wsClientSingleton";
import type { AgentEventSink } from "@/features/events/lib/eventSink";
import {
	createWsFrameId,
	describeWsConnectionFailure,
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
} from "@/features/runs/lib/runControlEvents";
import {
	createLiveQuerySession,
	type LiveQuerySession,
} from "@/features/conversation/lib/conversationSession";
import {
	isRunObservedByLiveQuerySession,
	resolveMainChatRuntime,
} from "@/features/runs/lib/runRuntimeState";
import { dispatchRunStartedPushEvent } from "@/features/runs/lib/mainChatRunActivation";
import { readExplicitEditingMode } from "@/features/runs/lib/editingMode";
import { resolveRunOwner } from "@/features/runs/lib/runOwner";
import { resolveRunAgentKey } from "@/features/runs/lib/runAgentIdentity";
import type { RunSession } from "@/features/runs/lib/runSession";
import { normalizeTimelineAttachments } from "@/features/artifacts/lib/timelineAttachments";
import {
	readEventTeamId,
	readMustUseSkills,
	readRequestQueryText,
} from "@/shared/utils/eventFieldReaders";
import { toText } from "@/shared/utils/eventUtils";
import {
	dispatchRunAttachDebugEvent,
	readRunAttachDebugSnapshot,
} from "@/features/runs/lib/runAttachDebugEvents";

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

function readPushWireType(frame: {
	type?: string;
	payload?: unknown;
	data?: unknown;
}): string {
	const nestedRecord = isObjectRecord(frame.payload)
		? frame.payload
		: isObjectRecord(frame.data)
			? frame.data
			: {};
	return String(frame.type || nestedRecord.type || "").trim();
}

function hasValidRequiredPushTime(
	wireType: string,
	event: AgentEvent,
	frame: Record<string, unknown>,
): boolean {
	return hasValidDesktopPushTimeContract({
		type: wireType,
		event,
		frame,
	});
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

	const teamId = String(raw.teamId || "").trim();
	const owner = toRunOwner({
		teamId,
		agentKey: event.agentKey || raw.firstAgentKey,
	});
	const agentKey = owner?.kind === "agent" ? owner.agentKey : "";
	if (agentKey) {
		chatPatch.agentKey = agentKey;
		chatPatch.firstAgentKey = agentKey;
	}
	if (teamId) {
		chatPatch.teamId = teamId;
	}
	if (owner) {
		chatPatch.owner = owner;
	}

	const source = String(raw.source || "").trim();
	if (source) {
		chatPatch.source = source;
	}

	const runId = String(event.runId || raw.lastRunId || "").trim();
	if (runId) {
		chatPatch.lastRunId = runId;
	}
	const hasActiveRun = resolveChatSummaryActiveRun(event);
	const editingMode = readExplicitEditingMode(event);
	if (hasActiveRun !== undefined) {
		chatPatch.hasActiveRun = hasActiveRun;
		chatPatch.activeRun = hasActiveRun
		? {
					runId,
					...(agentKey ? { agentKey } : {}),
					...(owner?.kind === "orchestrated-team" ? { teamId: owner.teamId } : {}),
					...(owner ? { owner } : {}),
					...(typeof editingMode === "boolean" ? { editingMode } : {}),
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
	querySessionsRef?: { current: Map<string, LiveQuerySession> };
	activeQuerySessionRequestIdRef?: { current: string };
	activeAttachRef?: { current: ActiveAttachState | null };
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

function isTerminalPushForSession(
	session: RunSession | null | undefined,
	chatId: string,
	runId: string,
): boolean {
	if (!session) {
		return false;
	}
	const sessionRunId = String(session.runId || "").trim();
	if (sessionRunId !== runId) {
		return false;
	}
	const sessionChatId = String(session.chatId || "").trim();
	return !sessionChatId || sessionChatId === chatId;
}

function syncCurrentTerminalPushObservation(
	options: Pick<
		ConnectWsTransportOptions,
		| "dispatch"
		| "stateRef"
		| "querySessionsRef"
		| "activeQuerySessionRequestIdRef"
		| "activeAttachRef"
	>,
	chatId: string,
	runId: string,
): void {
	const currentChatId = String(options.stateRef.current.chatId || "").trim();
	if (!chatId || !runId || !currentChatId || currentChatId !== chatId) {
		return;
	}

	const currentActiveRun = options.stateRef.current.currentChatActiveRun;
	const mainRuntime = resolveMainChatRuntime(
		options.stateRef,
		options.activeQuerySessionRequestIdRef,
		options.querySessionsRef,
	);
	const matchesActiveRun =
		currentActiveRun?.runId === runId &&
		currentActiveRun.chatId === chatId;
	const matchesActiveSession = isTerminalPushForSession(
		mainRuntime.session,
		chatId,
		runId,
	);
	const currentAttach = options.activeAttachRef?.current || null;
	const matchesActiveAttach =
		currentAttach?.runId === runId &&
		currentAttach.chatId === chatId;

	if (
		!matchesActiveRun &&
		!matchesActiveSession &&
		!matchesActiveAttach
	) {
		return;
	}

	if (options.querySessionsRef) {
		for (const session of options.querySessionsRef.current.values()) {
			if (isTerminalPushForSession(session, chatId, runId)) {
				session.streaming = false;
				session.abortController = null;
			}
		}
	}

	if (matchesActiveAttach && options.activeAttachRef) {
		currentAttach.abort();
		options.activeAttachRef.current = null;
	}

	options.dispatch({ type: "SET_STREAMING", streaming: false });
	options.dispatch({ type: "SET_ABORT_CONTROLLER", controller: null });
	dispatchRunAttachDebugEvent(options.dispatch, {
		stage: "runObservationReleased",
		chatId,
		runId,
		reason: "terminal_push",
		...readRunAttachDebugSnapshot({
			state: options.stateRef.current,
			querySessionsRef: options.querySessionsRef,
			activeQuerySessionRequestIdRef: options.activeQuerySessionRequestIdRef,
			activeAttachRef: options.activeAttachRef,
		}),
	});
}

type ActiveAttachState = {
	requestId: string;
	runId: string;
	chatId: string;
	agentKey: string;
	owner: RunOwner;
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
	teamId?: unknown;
	owner?: RunOwner;
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

function resolveAttachOwner(
	state: AppState,
	chatId: string,
	runId: string,
	detail?: Record<string, unknown>,
): RunOwner | null {
	const runOwner = toRunOwner({
		agentKey: resolveRunAgentKey({
			runId,
			runAgentById: state.runAgentById,
			routingAgentKey: state.currentRunAgentKey,
			chatId,
			chatAgentById: state.chatAgentById,
			chats: state.chats,
		}),
	});
	return resolveRunOwner({
		chatId,
		chats: state.chats,
		currentRunOwner: runOwner,
		eventIdentity: { teamId: detail?.teamId, agentKey: detail?.agentKey },
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
): { chatId: string; runId: string; owner: RunOwner; reason: DetachRunReason } | null {
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
	const owner = resolveRunOwner({
		chatId,
		chats: state.chats,
		currentRunOwner: detail.owner || toRunOwner({
			agentKey: resolveRunAgentKey({
				runId,
				runAgentById: state.runAgentById,
				routingAgentKey: state.currentRunAgentKey,
				chatId,
				chatAgentById: state.chatAgentById,
				chats: state.chats,
			}),
		}),
		sessionOwner: session?.owner,
		eventIdentity: { teamId: detail.teamId, agentKey: detail.agentKey || session?.agentKey },
	});
	if (!owner) {
		return null;
	}
	return {
		chatId,
		runId,
		owner,
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
			`[ws detach] skipped: missing runId or owner (chatId=${toText(detail.chatId) || "-"})`,
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
		type: dataEndpoints.detach.path,
		payload: {
			runId: target.runId,
			...runOwnerPayload(target.owner),
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
	if (nextAgentKey && session.owner?.kind !== "orchestrated-team") {
		session.agentKey = nextAgentKey;
	}
	const nextTeamId = readEventTeamId(event);
	if (nextTeamId) {
		session.teamId = nextTeamId;
	}
	if (toText(event.type) === "request.query") {
		const editingMode = readExplicitEditingMode(event);
		if (editingMode !== undefined) {
			session.editingMode = editingMode;
		}
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
	const mustUseSkills = readMustUseSkills(event);
	if (!text && attachments.length === 0) {
		return;
	}
	const timestamp = readEpochMillis(event.timestamp);
	if (timestamp === undefined) {
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
			ts: timestamp,
			mustUseSkills: mustUseSkills.length > 0 ? mustUseSkills : undefined,
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
		const owner = resolveAttachOwner(options.stateRef.current, chatId, runId, detail);
		const agentKey = owner?.kind === "agent" ? owner.agentKey : "";
		const lastSeqRaw = Number(detail?.lastSeq ?? 0);
		const lastSeq = Number.isFinite(lastSeqRaw) && lastSeqRaw >= 0 ? lastSeqRaw : 0;
		if (!runId || !chatId) {
			dispatchRunAttachDebugEvent(options.dispatch, {
				stage: "attachRunIgnored",
				chatId,
				runId,
				agentKey,
				reason: "missing_identity",
				...readRunAttachDebugSnapshot({
					state: options.stateRef.current,
					querySessionsRef: options.querySessionsRef,
					activeQuerySessionRequestIdRef: options.activeQuerySessionRequestIdRef,
					activeAttachRef: options.activeAttachRef,
				}),
			});
			return;
		}
		if (!owner) {
			options.dispatch({
				type: "APPEND_DEBUG",
				line: `[ws attach] skipped: missing owner (chatId=${chatId}, runId=${runId})`,
			});
			dispatchRunAttachDebugEvent(options.dispatch, {
				stage: "attachRunIgnored",
				chatId,
				runId,
				agentKey,
				reason: "missing_owner",
				...readRunAttachDebugSnapshot({
					state: options.stateRef.current,
					querySessionsRef: options.querySessionsRef,
					activeQuerySessionRequestIdRef: options.activeQuerySessionRequestIdRef,
					activeAttachRef: options.activeAttachRef,
				}),
			});
			return;
		}
		if (isRunObservedByLiveQuerySession({
			chatId,
			runId,
			owner,
			querySessions: options.querySessionsRef,
		})) {
			dispatchRunAttachDebugEvent(options.dispatch, {
				stage: "attachRunIgnored",
				chatId,
				runId,
				agentKey,
				reason: "live_query_observing",
				...readRunAttachDebugSnapshot({
					state: options.stateRef.current,
					querySessionsRef: options.querySessionsRef,
					activeQuerySessionRequestIdRef: options.activeQuerySessionRequestIdRef,
					activeAttachRef: options.activeAttachRef,
				}),
			});
			return;
		}
		const current = options.activeAttachRef.current;
		if (current && current.runId === runId && current.chatId === chatId && sameRunOwner(current.owner, owner)) {
			dispatchRunAttachDebugEvent(options.dispatch, {
				stage: "attachRunIgnored",
				chatId,
				runId,
				agentKey,
				reason: "duplicate_observe_local",
				...readRunAttachDebugSnapshot({
					state: options.stateRef.current,
					querySessionsRef: options.querySessionsRef,
					activeQuerySessionRequestIdRef: options.activeQuerySessionRequestIdRef,
					activeAttachRef: options.activeAttachRef,
				}),
			});
			return;
		}

		const wsClient = getWsClientImpl();
		if (!wsClient) {
			dispatchRunAttachDebugEvent(options.dispatch, {
				stage: "attachRunIgnored",
				chatId,
				runId,
				agentKey,
				reason: "missing_ws_client",
				...readRunAttachDebugSnapshot({
					state: options.stateRef.current,
					querySessionsRef: options.querySessionsRef,
					activeQuerySessionRequestIdRef: options.activeQuerySessionRequestIdRef,
					activeAttachRef: options.activeAttachRef,
				}),
			});
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
					owner: current.owner,
					...(current.owner.kind === "agent" ? { agentKey: current.owner.agentKey } : {}),
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
			observationSource: "attach",
			chatId,
			owner,
		});
		session.runId = runId;
		session.agentKey = agentKey;
		session.teamId = owner.kind === "orchestrated-team" ? owner.teamId : "";
		session.streaming = true;
		session.abortController = controller;

		let receivedServerActivity = false;
		const retryCount = { current: 0 };
		const abortFns: Array<() => void> = [];
		const startAttachStream = () => {
			const streamResult = wsClient.stream({
				type: dataEndpoints.attach.path,
				payload: {
					runId,
					...runOwnerPayload(owner),
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
				onDone: () => {
					cleanupActiveAttach(requestId);
				},
				requestId,
			});
			abortFns.push(streamResult.abort);
		};

		dispatchRunAttachDebugEvent(options.dispatch, {
			stage: "attachRunRequested",
			chatId,
			runId,
			agentKey,
			...readRunAttachDebugSnapshot({
				state: options.stateRef.current,
				querySessionsRef: options.querySessionsRef,
				activeQuerySessionRequestIdRef: options.activeQuerySessionRequestIdRef,
				activeAttachRef: options.activeAttachRef,
			}),
			activeRequestId: requestId,
			activeSessionRunId: runId,
			activeSessionStreaming: true,
			activeAttachRunId: runId,
		});
		startAttachStream();

		options.querySessionsRef.current.set(requestId, session);
		options.chatQuerySessionIndexRef.current.set(chatId, requestId);
		options.activeQuerySessionRequestIdRef.current = requestId;
		options.activeAttachRef.current = {
			requestId,
			runId,
			chatId,
			agentKey,
			owner,
			controller,
			abort: () => {
				for (const fn of abortFns) {
					fn();
				}
				controller.abort();
			},
		};
		options.dispatch({ type: "SET_RUN_ID", runId });
		if (owner.kind === "agent") {
			options.dispatch({ type: "SET_RUN_AGENT_BY_ID", runId, agentKey });
			options.dispatch({ type: "SET_CURRENT_RUN_AGENT_KEY", agentKey });
		}
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
					owner: current.owner,
					...(current.owner.kind === "agent" ? { agentKey: current.owner.agentKey } : {}),
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
	let hasConnected = false;
	let previousStatus: AppState["wsStatus"] = "disconnected";
	return initWsClientImpl({
		accessToken,
		allowAnonymous: !appMode,
		resolveAccessToken: async (reason) => {
			if (!appMode) {
				return currentStateToken();
			}
			return syncToken(await ensureAccessTokenImpl(reason));
		},
		onStatusChange: (status) => {
			options.dispatch({ type: "SET_WS_STATUS", status });
			if (status === "connected") {
				if (hasConnected && previousStatus !== "connected") {
					refreshCurrentChatAfterWsReconnect(options.stateRef.current);
				}
				hasConnected = true;
			}
			previousStatus = status;
		},
		onPush: (frame) => {
			const wireType = readPushWireType(frame);
			const liveEvent = toPushEvent(frame);
			if (!hasValidRequiredPushTime(wireType, liveEvent, frame)) {
				appendWsDebug(
					options.dispatch,
					`[time_contract_violation] ignored WebSocket push ${wireType || String(liveEvent.type || "unknown")} without valid epoch_ms_int64 time`,
				);
				if (
					typeof window !== "undefined" &&
					typeof window.dispatchEvent === "function" &&
					typeof CustomEvent === "function"
				) {
					window.dispatchEvent(new CustomEvent("agent:refresh-worker-data"));
				}
				return;
			}
			markDebugEventHidden(liveEvent);
			const type = String(liveEvent.type || "");
			const currentChatId = String(options.stateRef.current.chatId || "").trim();
			const eventChatId = String(liveEvent.chatId || "").trim();

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

			if (type === "chat.renamed") {
				const chatId = String(liveEvent.chatId || "").trim();
				const chatName = String(liveEvent.chatName || "").trim();
				if (chatId && chatName) {
					options.dispatch({ type: "CHAT_RENAMED", chatId, chatName });
				}
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

			if (type === "archive.restored") {
				const summary = isObjectRecord(liveEvent.summary)
					? (liveEvent.summary as Partial<Chat> & Pick<Chat, "chatId">)
					: null;
				if (summary?.chatId) {
					options.dispatch({ type: "UPSERT_CHAT", chat: summary });
					window.dispatchEvent(new CustomEvent("agent:refresh-worker-data"));
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
				const runId = String(liveEvent.runId || "").trim();
				const owner = resolveRunOwner({
					chatId: eventChatId,
					chats: options.stateRef.current.chats,
					eventIdentity: {
						teamId: readEventTeamId(liveEvent),
						agentKey: liveEvent.agentKey,
					},
				});
				const agentKey = owner?.kind === "agent" ? owner.agentKey : "";
				dispatchRunAttachDebugEvent(options.dispatch, {
					stage: "runStartedCandidate",
					chatId: eventChatId,
					runId,
					agentKey,
					...readRunAttachDebugSnapshot({
						state: options.stateRef.current,
						querySessionsRef: options.querySessionsRef,
						activeQuerySessionRequestIdRef: options.activeQuerySessionRequestIdRef,
						activeAttachRef: options.activeAttachRef,
					}),
				});
				if (owner) {
					dispatchRunStartedPushEvent({
						chatId: eventChatId,
						runId,
						agentKey,
						owner,
						lastSeq: 0,
						...(typeof readExplicitEditingMode(liveEvent) === "boolean"
							? { editingMode: readExplicitEditingMode(liveEvent) }
							: {}),
					});
				}
				return;
			}

			if (type === "run.complete" || type === "run.error" || type === "run.cancel") {
				// 将仍处于 running 状态的 PlanRuntime 标记为 completed
				for (const [taskId, runtime] of options.stateRef.current.planRuntimeByTaskId) {
					if (runtime.status === "running") {
						options.dispatch({
							type: "SET_PLAN_RUNTIME",
							taskId,
							runtime: {
								status: "completed",
								updatedAt: liveEvent.timestamp ?? Date.now(),
								error: "",
							},
						});
					}
				}

				upsertPushChatSummary(options.dispatch, liveEvent);
				const currentActiveRun = options.stateRef.current.currentChatActiveRun;
				const runId = String(liveEvent.runId || "").trim();
				syncCurrentTerminalPushObservation(
					{
						dispatch: options.dispatch,
						stateRef: options.stateRef,
						querySessionsRef: options.querySessionsRef,
						activeQuerySessionRequestIdRef: options.activeQuerySessionRequestIdRef,
						activeAttachRef: options.activeAttachRef,
					},
					eventChatId,
					runId,
				);
				if (
					currentActiveRun?.runId &&
					currentActiveRun.runId === runId &&
					currentActiveRun.chatId === eventChatId
				) {
					options.dispatch({ type: "SET_CURRENT_CHAT_ACTIVE_RUN", activeRun: null });
				}
				return;
			}

			const isAwaitingPushEvent =
				isAwaitingAskPushEvent(type) || isAwaitingAnswerPushEvent(type);
			if (isAwaitingPushEvent) {
				upsertPushChatSummary(options.dispatch, liveEvent);
				return;
			}

			const mainRuntime = resolveMainChatRuntime(
				options.stateRef,
				options.activeQuerySessionRequestIdRef,
				options.querySessionsRef,
			);
			if (mainRuntime.streaming) {
				return;
			}

			if (currentChatId && eventChatId && eventChatId !== currentChatId) {
				return;
			}

			options.handleEvent(liveEvent);
		},
		onTransportError: (error) => {
			showTransportError(error.message);
		},
	});
}

export function refreshCurrentChatAfterWsReconnect(state: AppState): void {
	const chatId = String(state.chatId || "").trim();
	const shouldRefresh = Boolean(
		chatId
		&& (
			state.activeAwaiting
			|| state.currentChatActiveRun
			|| String(state.runId || "").trim()
		)
	);
	if (
		!shouldRefresh
		|| typeof window === "undefined"
		|| typeof window.dispatchEvent !== "function"
		|| typeof CustomEvent !== "function"
	) {
		return;
	}
	window.dispatchEvent(new CustomEvent("agent:load-chat", {
		detail: { chatId },
	}));
}

let lastTransportErrorMessage = "";
let lastTransportErrorTime = 0;
const TRANSPORT_ERROR_DEDUP_MS = 3_000;

function showTransportError(msg: string): void {
	const now = Date.now();
	if (msg === lastTransportErrorMessage && now - lastTransportErrorTime < TRANSPORT_ERROR_DEDUP_MS) {
		return;
	}
	lastTransportErrorMessage = msg;
	lastTransportErrorTime = now;
	void message.error(msg);
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

	if (!initialToken && appMode) {
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

export function useConversationWsRuntime(options: {
	onAgentEvent: AgentEventSink;
}): void {
	const {
		dispatch,
		state,
		stateRef,
		querySessionsRef,
		chatQuerySessionIndexRef,
		activeQuerySessionRequestIdRef,
	} = useAppContext();
	const handleEventRef = useRef(options.onAgentEvent);
	const activeAttachRef = useRef<ActiveAttachState | null>(null);
	const appMode = isAppMode();
	const wsConnectKey = appMode ? "__app_mode__" : state.accessToken;

	useEffect(() => {
		handleEventRef.current = options.onAgentEvent;
	}, [options.onAgentEvent]);

	const stableHandleEvent = useCallback((event: AgentEvent) => {
		handleEventRef.current(event);
	}, []);

	useEffect(() => {
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
		stateRef,
	]);

	useEffect(() => {
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
		stateRef,
	]);

	useEffect(() => {
		if (
			typeof window === "undefined"
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
		stateRef,
	]);

	useEffect(() => {
		let cancelled = false;

		void connectWsTransport({
			dispatch,
			state: { accessToken: stateRef.current.accessToken },
			stateRef,
			querySessionsRef,
			activeQuerySessionRequestIdRef,
			activeAttachRef,
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
			if (isGatewayBackendMode()) {
				scheduleDestroyWsClient();
			}
			dispatch({ type: "SET_WS_ERROR_MESSAGE", message: "" });
			dispatch({ type: "SET_WS_STATUS", status: "disconnected" });
		};
	}, [
		dispatch,
		activeQuerySessionRequestIdRef,
		querySessionsRef,
		stableHandleEvent,
		stateRef,
		wsConnectKey,
	]);
}
