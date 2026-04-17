import { useEffect } from "react";
import type { Dispatch } from "react";
import type { AppAction } from "../context/AppContext";
import { useAppContext } from "../context/AppContext";
import type { AgentEvent, AppState, Chat } from "../context/types";
import { ensureAccessToken } from "../lib/apiClient";
import { readStoredTransportMode } from "../lib/transportMode";
import { setTransportModeProvider } from "../lib/apiClientProxy";
import { isAppMode } from "../lib/routing";
import { destroyWsClient, initWsClient } from "../lib/wsClientSingleton";
import { useAgentEventHandler } from "./useAgentEventHandler";
import {
	describeWsConnectionFailure,
	toWsConnectionError,
	type WsClient,
} from "../lib/wsClient";

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

function resolveChatUpdatedAt(event: AgentEvent): string | number {
	const raw = event as Record<string, unknown>;
	if (typeof raw.updatedAt === "string") {
		return raw.updatedAt;
	}
	if (
		typeof raw.updatedAt === "number"
		&& Number.isFinite(raw.updatedAt)
	) {
		return raw.updatedAt;
	}
	if (
		typeof event.timestamp === "number"
		&& Number.isFinite(event.timestamp)
		&& event.timestamp > 0
	) {
		return event.timestamp;
	}
	return Date.now();
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
		updatedAt: resolveChatUpdatedAt(event),
	};

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

	const runId = String(event.runId || "").trim();
	if (runId) {
		chatPatch.lastRunId = runId;
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

			if (type === "run.start") {
				upsertPushChatSummary(options.dispatch, liveEvent);
				if (options.stateRef.current.streaming) {
					return;
				}
				if (isActiveChat) {
					options.handleEvent(liveEvent);
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
	const { dispatch, state, stateRef } = useAppContext();
	const { handleEvent } = useAgentEventHandler();

	useEffect(() => {
		setTransportModeProvider(() => stateRef.current.transportMode);
		return () => {
			setTransportModeProvider(() => readStoredTransportMode() || "sse");
		};
	}, [stateRef]);

	useEffect(() => {
		if (state.transportMode !== "ws") {
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
			destroyWsClient();
			dispatch({ type: "SET_WS_ERROR_MESSAGE", message: "" });
			dispatch({ type: "SET_WS_STATUS", status: "disconnected" });
		};
	}, [dispatch, handleEvent, state.accessToken, state.transportMode, stateRef]);
}
