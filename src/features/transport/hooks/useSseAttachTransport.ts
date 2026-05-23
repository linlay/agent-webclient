import { useCallback, useEffect, useRef } from "react";
import type { Dispatch } from "react";
import type { AppAction } from "@/app/state/AppContext";
import { useAppContext } from "@/app/state/AppContext";
import type { AgentEvent, AppState } from "@/app/state/types";
import {
	createLiveQuerySession,
	type LiveQuerySession,
} from "@/features/chats/lib/conversationSession";
import { normalizeTimelineAttachments } from "@/features/artifacts/lib/timelineAttachments";
import { executeAttachRunSse } from "@/features/transport/lib/queryStreamRuntime.sse";
import { useAgentEventHandler } from "@/features/timeline/hooks/useAgentEventHandler";
import { createRequestId } from "@/shared/api/apiClient";
import {
	readEventTeamId,
	readRequestQueryText,
} from "@/shared/utils/eventFieldReaders";
import { toText } from "@/shared/utils/eventUtils";

type SseAttachDispatch = Dispatch<AppAction>;

type ActiveSseAttachState = {
	requestId: string;
	runId: string;
	chatId: string;
	agentKey: string;
	controller: AbortController;
	abort: () => void;
};

interface RegisterSseAttachRunListenerOptions {
	dispatch: SseAttachDispatch;
	stateRef: { current: AppState };
	handleEvent: (event: AgentEvent) => void;
	activeAttachRef: { current: ActiveSseAttachState | null };
	querySessionsRef: { current: Map<string, LiveQuerySession> };
	chatQuerySessionIndexRef: { current: Map<string, string> };
	activeQuerySessionRequestIdRef: { current: string };
	executeAttachRunSseImpl?: typeof executeAttachRunSse;
	createRequestIdImpl?: typeof createRequestId;
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

function resolveAttachAgentKey(state: AppState, chatId: string, detail?: Record<string, unknown>): string {
	const explicitAgentKey = toText(detail?.agentKey);
	if (explicitAgentKey) {
		return explicitAgentKey;
	}
	const chat = state.chats.find((item) => toText(item?.chatId) === chatId);
	return (
		toText(chat?.agentKey)
		|| toText(chat?.firstAgentKey)
		|| toText(state.chatAgentById.get(chatId))
	);
}

function renderAttachedRequestQuery(
	options: RegisterSseAttachRunListenerOptions,
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

export function registerSseAttachRunListener(
	options: RegisterSseAttachRunListenerOptions,
): () => void {
	const executeAttachRunSseImpl = options.executeAttachRunSseImpl ?? executeAttachRunSse;
	const createRequestIdImpl = options.createRequestIdImpl ?? createRequestId;

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
		const agentKey = resolveAttachAgentKey(options.stateRef.current, chatId, detail);
		const lastSeqRaw = Number(detail?.lastSeq ?? 0);
		const lastSeq = Number.isFinite(lastSeqRaw) && lastSeqRaw >= 0 ? lastSeqRaw : 0;
		if (!runId || !chatId) {
			return;
		}
		if (!agentKey) {
			options.dispatch({
				type: "APPEND_DEBUG",
				line: `[sse attach] skipped: missing agentKey (chatId=${chatId}, runId=${runId})`,
			});
			return;
		}

		const current = options.activeAttachRef.current;
		if (current && current.runId === runId && current.chatId === chatId && current.agentKey === agentKey) {
			return;
		}

		current?.abort();

		const requestId = createRequestIdImpl("attach");
		const controller = new AbortController();
		const session = createLiveQuerySession({
			requestId,
			chatId,
		});
		session.runId = runId;
		session.agentKey = agentKey;
		session.streaming = true;
		session.abortController = controller;
		options.querySessionsRef.current.set(requestId, session);
		options.chatQuerySessionIndexRef.current.set(chatId, requestId);
		options.activeQuerySessionRequestIdRef.current = requestId;
		options.activeAttachRef.current = {
			requestId,
			runId,
			chatId,
			agentKey,
			controller,
			abort: () => controller.abort(),
		};
		options.dispatch({ type: "SET_RUN_ID", runId });
		options.dispatch({ type: "SET_REQUEST_ID", requestId });
		options.dispatch({ type: "SET_STREAMING", streaming: true });
		options.dispatch({ type: "SET_ABORT_CONTROLLER", controller });

		const attachHandleEvent = (attachedEvent: AgentEvent) => {
			renderAttachedRequestQuery(options, attachedEvent);
			const isTerminal = isAttachTerminalRunEventType(toText(attachedEvent.type));
			session.bufferedEvents.push(attachedEvent);
			bindAttachSessionIdentity(session, attachedEvent);
			if (isTerminal) {
				session.streaming = false;
				session.abortController = null;
			}
			if (session.chatId) {
				options.chatQuerySessionIndexRef.current.set(
					session.chatId,
					session.requestId,
				);
			}
			options.handleEvent(attachedEvent);
			if (isTerminal) {
				cleanupActiveAttach(requestId);
			}
		};

		void executeAttachRunSseImpl({
			params: {
				runId,
				agentKey,
				lastSeq,
				signal: controller.signal,
			},
			dispatch: options.dispatch,
			handleEvent: attachHandleEvent,
		})
			.catch((error) => {
				if ((error as Error).name === "AbortError") {
					return;
				}
				options.dispatch({
					type: "APPEND_DEBUG",
					line: `[sse attach error] ${(error as Error).message}`,
				});
			})
			.finally(() => {
				cleanupActiveAttach(requestId);
			});
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

export function useSseAttachTransport(): void {
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
	const activeAttachRef = useRef<ActiveSseAttachState | null>(null);

	useEffect(() => {
		handleEventRef.current = handleEvent;
	}, [handleEvent]);

	const stableHandleEvent = useCallback((event: AgentEvent) => {
		handleEventRef.current(event);
	}, []);

	useEffect(() => {
		if (state.transportMode !== "sse") {
			activeAttachRef.current?.abort();
			activeAttachRef.current = null;
			return;
		}

		return registerSseAttachRunListener({
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
}
