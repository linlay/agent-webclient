import { t } from "@/shared/i18n";
import { createCompactId } from "@/shared/utils/compactId";
import { getClientDeviceId } from "@/shared/data/clientDeviceId";
import { getClientSurfaceId } from "@/shared/data/clientSurfaceId";
import { isGatewayBackendMode } from "@/shared/config/backendMode";
import {
	handleFinalUnauthorized,
	isWsAuthenticationRequired,
} from "@/shared/data/auth/authCoordinator";
import {
	type PlatformErrorFrame,
	type PlatformResponseFrame,
	type PlatformStreamEventFrame,
} from "@/features/transport/lib/platformFrameCodec";
import {
	PlatformFrameClient,
	PlatformRequestTimeoutError,
} from "@/features/transport/lib/platformFrameClient";
import type { AgentPlatformRequestFrame } from "@/features/transport/contracts/generated/agentWebclientBridge";

export type WsConnectionStatus =
	| "disconnected"
	| "connecting"
	| "connected"
	| "error";

export type WsAccessTokenRefreshReason = "missing" | "unauthorized";

export type WsSocketEventType = "open" | "message" | "error" | "close";

export interface WsSocketLike {
	readonly readyState: number;
	send(data: string): void;
	close(code?: number, reason?: string): void;
	addEventListener(type: WsSocketEventType, listener: (event: any) => void): void;
	removeEventListener(type: WsSocketEventType, listener: (event: any) => void): void;
}

export type WsSocketFactory = (url: string) => WsSocketLike;

interface WsRequestFrame {
	frame: "request";
	type: string;
	id: string;
	payload?: unknown;
}

export interface WsInboundRequestFrame {
	frame: "request";
	type: string;
	id: string;
	payload?: unknown;
}

type WsResponseFrame = PlatformResponseFrame;
type WsStreamEventFrame = PlatformStreamEventFrame;

interface WsStreamFrame {
	frame: "stream";
	id?: string;
	event?: WsStreamEventFrame;
	reason?: string;
	lastSeq?: number;
}

export interface WsPushFrame {
	frame: "push";
	type?: string;
	payload?: unknown;
	data?: unknown;
	[key: string]: unknown;
}

type WsErrorFrame = PlatformErrorFrame;

type WsInboundFrame =
	| WsInboundRequestFrame
	| WsResponseFrame
	| WsStreamFrame
	| WsPushFrame
	| WsErrorFrame;

type WsOutboundResponseFrame = {
	frame: "response";
	type: string;
	id: string;
	code: number;
	msg: string;
	data?: unknown;
};

type WsOutboundErrorFrame = {
	frame: "error";
	type: string;
	id?: string;
	code: number;
	msg: string;
	data?: unknown;
};

type WsOutboundFrame =
	| WsRequestFrame
	| WsOutboundResponseFrame
	| WsOutboundErrorFrame;

export type WsInboundRequestHandler = (
	payload: unknown,
) => Promise<unknown> | unknown;

export type UnsubscribeWsInboundRequestHandler = () => void;

export class WsInboundRequestError extends Error {
	readonly type: string;
	readonly code: number;
	readonly data?: unknown;

	constructor(type: string, code: number, message: string, data?: unknown) {
		super(message);
		this.name = "WsInboundRequestError";
		this.type = type;
		this.code = code;
		this.data = data;
	}
}

export interface WsClientOptions {
	socketFactory?: WsSocketFactory;
	buildSocketUrl?: (accessToken: string) => string;
	accessToken?: string;
	allowAnonymous?: boolean;
	resolveAccessToken?: (
		reason: WsAccessTokenRefreshReason,
	) => string | Promise<string>;
	onAccessTokenChange?: (accessToken: string) => void;
	onStatusChange?: (status: WsConnectionStatus) => void;
	onPush?: (frame: WsPushFrame) => void;
	/** 当 pending request 或 active stream 因服务端错误被 reject 时触发，用于系统级用户反馈 */
	onTransportError?: (error: Error, context: { id?: string; kind: "request" | "stream" }) => void;
	connectTimeoutMs?: number;
	heartbeatTimeoutMs?: number;
	reconnectBaseDelayMs?: number;
	reconnectMaxDelayMs?: number;
	reconnectTokenRefreshThreshold?: number;
	healthCheckIntervalMs?: number;
	requestTimeoutMs?: number;
}

// Backend targets a 30s application heartbeat; the client allows about three
// missed beats plus scheduler jitter before it treats the socket as stale.
const WS_SERVER_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_WS_HEARTBEAT_TIMEOUT_MS =
	WS_SERVER_HEARTBEAT_INTERVAL_MS * 3 + 10_000;
const DEFAULT_WS_HEALTH_CHECK_INTERVAL_MS = 5_000;
const WS_HEARTBEAT_TIMEOUT_CLOSE_CODE = 4000;
const WS_HEARTBEAT_TIMEOUT_CLOSE_REASON = "heartbeat timeout";
const WS_HEARTBEAT_TIMEOUT_MESSAGE = "WebSocket heartbeat timeout";
const WS_TRANSPORT_DISCONNECTED_MESSAGE = "WebSocket transport disconnected";
const WS_TRANSPORT_NOT_CONNECTED_MESSAGE = "WebSocket transport is not connected";
const WS_TRANSPORT_NOT_INITIALIZED_MESSAGE =
	"WebSocket transport is not initialized";
const WS_SOCKET_CONNECTING = 0;
const WS_SOCKET_OPEN = 1;
const PLATFORM_WS_PROTOCOL_VERSION = 2;
const MIN_PLATFORM_HEARTBEAT_INTERVAL_MS = 5_000;
const MAX_PLATFORM_HEARTBEAT_INTERVAL_MS = 120_000;
const MAX_PLATFORM_SILENCE_TIMEOUT_MS = 600_000;

type PlatformWsHandshake = {
	sessionId: string;
	heartbeatIntervalMs: number;
	silenceTimeoutMs: number;
};

function safeInteger(value: unknown): number | null {
	return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function parsePlatformWsHandshake(raw: unknown): PlatformWsHandshake {
	const frame = JSON.parse(typeof raw === "string" ? raw : String(raw)) as Record<string, unknown>;
	const data = frame.data;
	if (frame.frame !== "push" || frame.type !== "connected" || !data || typeof data !== "object" || Array.isArray(data)) {
		throw new Error("connected must be the first Platform frame");
	}
	const payload = data as Record<string, unknown>;
	const liveness = payload.liveness;
	if (payload.protocolVersion !== PLATFORM_WS_PROTOCOL_VERSION || !liveness || typeof liveness !== "object" || Array.isArray(liveness)) {
		throw new Error("Agent Platform WebSocket protocol v2 is required");
	}
	const sessionId = String(payload.sessionId || "").trim();
	const serverTime = safeInteger(payload.serverTime);
	const policy = liveness as Record<string, unknown>;
	const heartbeatIntervalMs = safeInteger(policy.heartbeatIntervalMs);
	const silenceTimeoutMs = safeInteger(policy.silenceTimeoutMs);
	if (
		!sessionId || serverTime === null || heartbeatIntervalMs === null ||
		heartbeatIntervalMs < MIN_PLATFORM_HEARTBEAT_INTERVAL_MS ||
		heartbeatIntervalMs > MAX_PLATFORM_HEARTBEAT_INTERVAL_MS ||
		silenceTimeoutMs === null ||
		silenceTimeoutMs < (2 * heartbeatIntervalMs) + 10_000 ||
		silenceTimeoutMs > MAX_PLATFORM_SILENCE_TIMEOUT_MS
	) {
		throw new Error("Agent Platform protocol-v2 liveness policy is invalid");
	}
	return { sessionId, heartbeatIntervalMs, silenceTimeoutMs };
}
export class WsClientDisconnectedError extends Error {
	code: string;

	constructor(message = WS_TRANSPORT_DISCONNECTED_MESSAGE) {
		super(message);
		this.name = "WsClientDisconnectedError";
		this.code = "WS_DISCONNECTED";
	}
}

export { PlatformRequestTimeoutError as WsClientRequestTimeoutError };

export function isWsTransportError(
	error: unknown,
): error is WsClientDisconnectedError | PlatformRequestTimeoutError {
	return (
		error instanceof WsClientDisconnectedError ||
		error instanceof PlatformRequestTimeoutError
	);
}

export interface WsConnectionErrorOptions {
	appMode?: boolean;
	hasAccessToken?: boolean;
}

type WsFrameIdKind = "wsreq" | "wsstream";

function normalizeWsFrameIdPrefix(kind: WsFrameIdKind): "wsr" | "wss" {
	return kind === "wsreq" ? "wsr" : "wss";
}

export function createWsFrameId(
	kind: WsFrameIdKind,
	nowMs = Date.now(),
): string {
	return createCompactId(normalizeWsFrameIdPrefix(kind), {
		nowMs,
		overflowMessage: "WebSocket request id overflow in the same second",
	});
}

function hasHelpfulWsMessage(message: string): boolean {
	return (
		message.startsWith("Missing access token") ||
		message.startsWith("Missing Access Token") ||
		message.startsWith("WebSocket handshake failed") ||
		message.startsWith(WS_TRANSPORT_NOT_INITIALIZED_MESSAGE) ||
		message.startsWith(t("ws.missingAccessToken.browser")) ||
		message.startsWith(t("ws.missingAccessToken.host")) ||
		message.startsWith(t("ws.handshakeFailed")) ||
		message.startsWith(t("ws.disconnected")) ||
		message.startsWith(t("ws.heartbeatTimeout")) ||
		message.startsWith(t("ws.transportNotInitialized"))
	);
}

function normalizeWsCloseReason(reason: unknown): string {
	return String(reason || "").trim();
}

function isHeartbeatTimeoutClose(
	event?: Pick<CloseEvent, "code" | "reason">,
): boolean {
	const code = Number(event?.code ?? 0);
	const reason = normalizeWsCloseReason(event?.reason).toLowerCase();
	return (
		code === WS_HEARTBEAT_TIMEOUT_CLOSE_CODE &&
		reason === WS_HEARTBEAT_TIMEOUT_CLOSE_REASON
	);
}

function isTransportDisconnectedMessage(message: string): boolean {
	return (
		message === WS_TRANSPORT_DISCONNECTED_MESSAGE ||
		message === WS_TRANSPORT_NOT_CONNECTED_MESSAGE ||
		message.startsWith(`${WS_TRANSPORT_DISCONNECTED_MESSAGE}:`)
	);
}

function readTransportDisconnectReason(message: string): string {
	const prefix = `${WS_TRANSPORT_DISCONNECTED_MESSAGE}:`;
	return message.startsWith(prefix) ? message.slice(prefix.length).trim() : "";
}

function createDisconnectErrorFromClose(
	event?: Pick<CloseEvent, "code" | "reason">,
): WsClientDisconnectedError {
	if (isHeartbeatTimeoutClose(event)) {
		return new WsClientDisconnectedError(WS_HEARTBEAT_TIMEOUT_MESSAGE);
	}
	const reason = normalizeWsCloseReason(event?.reason);
	if (reason) {
		return new WsClientDisconnectedError(
			`${WS_TRANSPORT_DISCONNECTED_MESSAGE}: ${reason}`,
		);
	}
	return new WsClientDisconnectedError(WS_TRANSPORT_DISCONNECTED_MESSAGE);
}

function missingAccessTokenMessage(appMode = false): string {
	return appMode
		? t("ws.missingAccessToken.host")
		: t("ws.missingAccessToken.browser");
}

export function isWsConnectionFailure(error: unknown): boolean {
	if (error instanceof WsClientDisconnectedError) {
		return true;
	}
	const message =
		error instanceof Error ? String(error.message || "").trim() : "";
	if (!message) {
		return false;
	}
	return (
		hasHelpfulWsMessage(message) ||
		message === "WebSocket connection failed" ||
		message === WS_HEARTBEAT_TIMEOUT_MESSAGE ||
		isTransportDisconnectedMessage(message) ||
		message === WS_TRANSPORT_NOT_INITIALIZED_MESSAGE
	);
}

export function describeWsConnectionFailure(
	error: unknown,
	options: WsConnectionErrorOptions = {},
): string {
	const appMode = Boolean(options.appMode);
	const hasAccessToken = options.hasAccessToken !== false;
	const rawMessage =
		error instanceof Error
			? String(error.message || "").trim()
			: String(error || "").trim();

	if (!hasAccessToken) {
		return missingAccessTokenMessage(appMode);
	}
	if (!rawMessage) {
		return t("ws.handshakeFailed");
	}
	if (rawMessage === WS_TRANSPORT_NOT_INITIALIZED_MESSAGE) {
		return t("ws.transportNotInitialized");
	}
	if (rawMessage === WS_HEARTBEAT_TIMEOUT_MESSAGE) {
		return t("ws.heartbeatTimeout");
	}
	const disconnectReason = readTransportDisconnectReason(rawMessage);
	if (disconnectReason) {
		return t("ws.connectionFailedWithMessage", { message: disconnectReason });
	}
	if (isTransportDisconnectedMessage(rawMessage)) {
		return t("ws.disconnected");
	}
	if (hasHelpfulWsMessage(rawMessage)) {
		return rawMessage;
	}
	if (rawMessage === "WebSocket connection failed") {
		return t("ws.handshakeFailed");
	}
	return rawMessage.startsWith("WebSocket ")
		? rawMessage
		: t("ws.connectionFailedWithMessage", { message: rawMessage });
}

export function toWsConnectionError(
	error: unknown,
	options: WsConnectionErrorOptions = {},
): Error {
	const message = describeWsConnectionFailure(error, options);
	if (error instanceof Error && error.message === message) {
		return error;
	}
	if (error instanceof WsClientDisconnectedError) {
		return new WsClientDisconnectedError(message);
	}
	return new Error(message);
}

function buildWsUrl(accessToken = ""): string {
	const protocol =
		window.location.protocol === "https:" ? "wss:" : "ws:";
	const url = new URL(`${protocol}//${window.location.host}/ws`);
	if (isGatewayBackendMode()) {
		return url.toString();
	}
	const normalizedToken = String(accessToken || "").trim();
	if (normalizedToken) {
		url.searchParams.set("token", normalizedToken);
	}
	const deviceId = getClientDeviceId();
	if (deviceId) {
		url.searchParams.set("deviceId", deviceId);
	}
	url.searchParams.set("source", "WebClient");
	const surfaceId = getClientSurfaceId();
	if (surfaceId) {
		url.searchParams.set("surfaceId", surfaceId);
	}
	return url.toString();
}

export class StandaloneSocketDriver extends PlatformFrameClient {
	private accessToken: string;
	private socket: WsSocketLike | null = null;
	private readonly socketFactory: WsSocketFactory;
	private readonly buildSocketUrl: (accessToken: string) => string;
	private connectPromise: Promise<void> | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
	private accessTokenRefreshPromise: Promise<string> | null = null;
	private lifecycleVersion = 0;
	private reconnectAttempt = 0;
	private lastSeenAt = 0;
	private expectedClose = false;
	private disposed = false;
	private status: WsConnectionStatus = "disconnected";
	private readonly inboundRequestHandlers = new Map<
		string,
		WsInboundRequestHandler
	>();
	private readonly seenInboundRequestIds = new Set<string>();
	private inboundRequestGeneration = 0;
	private onStatusChange?: (status: WsConnectionStatus) => void;
	private readonly connectTimeoutMs: number;
	private heartbeatTimeoutMs: number;
	private readonly configuredHeartbeatTimeoutMs?: number;
	private platformSessionId = "";
	private lastHeartbeatSequence = 0;
	private readonly reconnectBaseDelayMs: number;
	private readonly reconnectMaxDelayMs: number;
	private readonly reconnectTokenRefreshThreshold: number;
	private readonly healthCheckIntervalMs: number;
	private resolveAccessToken?: (
		reason: WsAccessTokenRefreshReason,
	) => string | Promise<string>;
	private onAccessTokenChange?: (accessToken: string) => void;
	private allowAnonymous: boolean;

	constructor(options: WsClientOptions = {}) {
		super(Math.max(1, options.requestTimeoutMs ?? 30_000), options.onTransportError);
		this.accessToken = String(options.accessToken || "").trim();
		this.socketFactory = options.socketFactory || ((url) => new WebSocket(url));
		this.buildSocketUrl = options.buildSocketUrl || buildWsUrl;
		this.allowAnonymous = Boolean(options.allowAnonymous);
		this.resolveAccessToken = options.resolveAccessToken;
		this.onAccessTokenChange = options.onAccessTokenChange;
		this.onStatusChange = options.onStatusChange;
		this.setPushHandler(options.onPush);
		this.connectTimeoutMs = Math.max(1000, options.connectTimeoutMs ?? 10_000);
		this.configuredHeartbeatTimeoutMs = options.heartbeatTimeoutMs;
		this.heartbeatTimeoutMs = Math.max(
			1000,
			options.heartbeatTimeoutMs ?? DEFAULT_WS_HEARTBEAT_TIMEOUT_MS,
		);
		this.reconnectBaseDelayMs = Math.max(100, options.reconnectBaseDelayMs ?? 1_000);
		this.reconnectMaxDelayMs = Math.max(
			this.reconnectBaseDelayMs,
			options.reconnectMaxDelayMs ?? 30_000,
		);
		this.reconnectTokenRefreshThreshold = Math.max(
			1,
			options.reconnectTokenRefreshThreshold ?? 2,
		);
		this.healthCheckIntervalMs = Math.max(
			1000,
			options.healthCheckIntervalMs ?? DEFAULT_WS_HEALTH_CHECK_INTERVAL_MS,
		);
	}

	updateOptions(options: Partial<WsClientOptions> = {}): void {
		if (this.disposed) {
			return;
		}
		if (options.accessToken !== undefined) {
			this.accessToken = String(options.accessToken || "").trim();
		}
		if (options.allowAnonymous !== undefined) {
			this.allowAnonymous = Boolean(options.allowAnonymous);
		}
		if (options.resolveAccessToken !== undefined) {
			this.resolveAccessToken = options.resolveAccessToken;
		}
		if (options.onAccessTokenChange !== undefined) {
			this.onAccessTokenChange = options.onAccessTokenChange;
		}
		if (options.onStatusChange !== undefined) {
			this.onStatusChange = options.onStatusChange;
		}
		if (options.onPush !== undefined) {
			this.setPushHandler(options.onPush);
		}
		if (options.onTransportError !== undefined) {
			this.setTransportErrorHandler(options.onTransportError);
		}
	}

	registerInboundRequestHandler(
		type: string,
		handler: WsInboundRequestHandler,
	): UnsubscribeWsInboundRequestHandler {
		const normalizedType = String(type || "").trim();
		if (!normalizedType) {
			throw new Error("WebSocket inbound request type is required");
		}
		if (typeof handler !== "function") {
			throw new Error("WebSocket inbound request handler is required");
		}
		if (this.inboundRequestHandlers.has(normalizedType)) {
			throw new Error(
				`WebSocket inbound request handler already registered: ${normalizedType}`,
			);
		}
		this.inboundRequestHandlers.set(normalizedType, handler);
		return () => {
			if (this.inboundRequestHandlers.get(normalizedType) === handler) {
				this.inboundRequestHandlers.delete(normalizedType);
			}
		};
	}

	connect(signal?: AbortSignal): Promise<void> {
		if (this.disposed) {
			return Promise.reject(this.createDisposedError());
		}
		return this.ensureConnected(signal);
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.disposePlatformFrames(this.createDisposedError());
		this.disconnect();
	}

	disconnect(): void {
		this.lifecycleVersion += 1;
		this.expectedClose = true;
		this.clearReconnectTimer();
		this.clearHealthCheckTimer();
		this.failPlatformFrames(new WsClientDisconnectedError());
		this.inboundRequestGeneration += 1;
		this.seenInboundRequestIds.clear();

		if (this.socket) {
			try {
				if (
					this.socket.readyState === WS_SOCKET_OPEN ||
					this.socket.readyState === WS_SOCKET_CONNECTING
				) {
					this.socket.close(1000, "ws transport disconnect");
				}
			} catch {
				// Ignore close failures from a half-open socket.
			}
		}

		this.socket = null;
		this.connectPromise = null;
		this.platformSessionId = "";
		this.lastHeartbeatSequence = 0;
		this.reconnectAttempt = 0;
		this.setStatus("disconnected");
	}

	getStatus(): WsConnectionStatus {
		return this.status;
	}

	private hasConnectionCredentials(): boolean {
		return this.allowAnonymous || Boolean(this.accessToken);
	}

	private createHandshakeFailure(): Error {
		return this.allowAnonymous
			? new WsClientDisconnectedError()
			: new Error("WebSocket connection failed");
	}

	private async ensureConnected(
		signal?: AbortSignal,
		allowHandshakeRefresh = true,
	): Promise<void> {
		if (this.disposed) {
			throw this.createDisposedError();
		}
		if (this.socket?.readyState === WS_SOCKET_OPEN && this.status === "connected") {
			return;
		}

		if (signal?.aborted) {
			throw new DOMException("The operation was aborted.", "AbortError");
		}

		if (this.connectPromise) {
			return this.waitForConnection(signal);
		}

		this.expectedClose = false;
		this.setStatus("connecting");
		this.lastSeenAt = Date.now();
		const connectLifecycleVersion = this.lifecycleVersion;
		const isActiveHandshake = () =>
			!this.disposed && this.lifecycleVersion === connectLifecycleVersion;
		const inactiveConnectionError = () =>
			this.disposed
				? this.createDisposedError()
				: new WsClientDisconnectedError("WebSocket connection superseded");

		const pendingConnectPromise = new Promise<void>((resolve, reject) => {
			if (!isActiveHandshake()) {
				reject(inactiveConnectionError());
				return;
			}
			if (!this.accessToken && !this.allowAnonymous) {
				void this.refreshAccessToken("missing")
					.then((token) => {
						if (!isActiveHandshake()) {
							this.connectPromise = null;
							reject(inactiveConnectionError());
							return;
						}
						if (!token) {
							this.connectPromise = null;
							this.setStatus("error");
							reject(
								toWsConnectionError(new Error("Missing access token"), {
									hasAccessToken: false,
								}),
							);
							return;
						}
						this.connectPromise = null;
						void this.ensureConnected(signal, allowHandshakeRefresh)
							.then(resolve)
							.catch(reject);
					})
					.catch((error) => {
						this.connectPromise = null;
						if (!this.disposed) {
							this.setStatus("error");
						}
						reject(error);
					});
				return;
			}

			const socket = this.socketFactory(this.buildSocketUrl(this.accessToken));
			this.socket = socket;
			let didRetryHandshakeRefresh = false;
			let deferredAnonymousHandshakeErrorTimer: ReturnType<typeof setTimeout> | null = null;
			let connectTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
				connectTimer = null;
				cleanupBeforeOpen();
				if (isActiveHandshake() && this.socket === socket) {
					this.socket = null;
					this.setStatus("error");
					this.scheduleReconnect();
				}
				try {
					socket.close(4001, "connect timeout");
				} catch {
					// Ignore close failures for sockets that never finished opening.
				}
				this.connectPromise = null;
				if (!isActiveHandshake()) {
					reject(inactiveConnectionError());
					return;
				}
				reject(new WsClientDisconnectedError(
					"PLATFORM_WS_HANDSHAKE_TIMEOUT: Agent Platform protocol-v2 handshake timed out",
				));
			}, this.connectTimeoutMs);

			const cleanupBeforeOpen = () => {
				if (deferredAnonymousHandshakeErrorTimer) {
					clearTimeout(deferredAnonymousHandshakeErrorTimer);
					deferredAnonymousHandshakeErrorTimer = null;
				}
				if (connectTimer) {
					clearTimeout(connectTimer);
					connectTimer = null;
				}
				socket.removeEventListener("open", handleOpen);
				socket.removeEventListener("message", handleHandshakeMessage);
				socket.removeEventListener("error", handleError);
				socket.removeEventListener("close", handleCloseBeforeOpen);
			};
			const isCurrentSocket = () => this.socket === socket;

			const retryHandshakeWithFreshToken = async (): Promise<boolean> => {
				if (
					!allowHandshakeRefresh ||
					didRetryHandshakeRefresh ||
					!this.resolveAccessToken ||
					this.expectedClose ||
					!isActiveHandshake() ||
					signal?.aborted
				) {
					return false;
				}
				didRetryHandshakeRefresh = true;
				const previousToken = this.accessToken;
				try {
					await this.refreshAccessToken("unauthorized");
				} catch {
					return false;
				}
				if (!isActiveHandshake()) {
					return false;
				}
				if (!this.accessToken || this.accessToken === previousToken) {
					return false;
				}
				this.connectPromise = null;
				this.socket = null;
				this.setStatus("connecting");
				try {
					await this.ensureConnected(signal, false);
				} catch {
					return false;
				}
				return true;
			};

			const handleOpen = () => {
				socket.removeEventListener("open", handleOpen);
				if (!isActiveHandshake()) {
					try {
						socket.close(1000, "inactive ws connection");
					} catch {
						// Ignore close failures for sockets that are no longer active.
					}
					if (this.socket === socket) {
						this.socket = null;
					}
					reject(inactiveConnectionError());
					return;
				}
				if (!isCurrentSocket()) {
					try {
						socket.close(1000, "stale ws connection");
					} catch {
						// Ignore close failures for sockets that are no longer current.
					}
					if (this.socket?.readyState === WS_SOCKET_OPEN) {
						resolve();
						return;
					}
					resolve();
					return;
				}
				socket.addEventListener("message", handleHandshakeMessage);
			};

			const handleHandshakeMessage = (event: { data?: unknown }) => {
				if (!isActiveHandshake() || !isCurrentSocket()) return;
				let handshake: PlatformWsHandshake;
				try {
					handshake = parsePlatformWsHandshake(event.data);
				} catch (error) {
					cleanupBeforeOpen();
					this.socket = null;
					this.setStatus("error");
					try {
						socket.close(1002, "protocol mismatch");
					} catch {
						// The failed handshake is already detached locally.
					}
					reject(new WsClientDisconnectedError(
						`PLATFORM_WS_PROTOCOL_MISMATCH: ${error instanceof Error ? error.message : String(error)}`,
					));
					return;
				}
				cleanupBeforeOpen();
				this.platformSessionId = handshake.sessionId;
				this.lastHeartbeatSequence = 0;
				if (this.configuredHeartbeatTimeoutMs === undefined) {
					this.heartbeatTimeoutMs = handshake.silenceTimeoutMs;
				}
				socket.addEventListener("message", this.handleMessage);
				socket.addEventListener("close", this.handleClose);
				socket.addEventListener("error", this.handleSocketError);
				this.lastSeenAt = Date.now();
				this.reconnectAttempt = 0;
				this.clearReconnectTimer();
				this.startHealthCheck();
				this.setStatus("connected");
				resolve();
			};

			const finalizeHandshakeError = () => {
				cleanupBeforeOpen();
				const wasCurrentSocket = isCurrentSocket();
				if (wasCurrentSocket) {
					this.socket = null;
				}
				void (async () => {
					if (!isActiveHandshake()) {
						this.connectPromise = null;
						reject(inactiveConnectionError());
						return;
					}
					if (!wasCurrentSocket) {
						if (this.socket?.readyState === WS_SOCKET_OPEN) {
							resolve();
							return;
						}
						resolve();
						return;
					}
					if (await retryHandshakeWithFreshToken()) {
						resolve();
						return;
					}
					if (!isActiveHandshake()) {
						this.connectPromise = null;
						reject(inactiveConnectionError());
						return;
					}
					this.connectPromise = null;
					this.setStatus("error");
					this.scheduleReconnect();
					reject(
						toWsConnectionError(this.createHandshakeFailure(), {
							hasAccessToken: this.hasConnectionCredentials(),
						}),
					);
				})();
			};

			const handleError = () => {
				if (!this.allowAnonymous) {
					finalizeHandshakeError();
					return;
				}
				if (deferredAnonymousHandshakeErrorTimer) return;
				deferredAnonymousHandshakeErrorTimer = setTimeout(() => {
					deferredAnonymousHandshakeErrorTimer = null;
					finalizeHandshakeError();
				}, 0);
			};

			const handleCloseBeforeOpen = (event?: CloseEvent) => {
				cleanupBeforeOpen();
				const wasCurrentSocket = isCurrentSocket();
				void (async () => {
					if (!isActiveHandshake()) {
						this.connectPromise = null;
						reject(inactiveConnectionError());
						return;
					}
					if (!wasCurrentSocket) {
						if (this.socket?.readyState === WS_SOCKET_OPEN) {
							resolve();
							return;
						}
						resolve();
						return;
					}
					if (isGatewayBackendMode() && Number(event?.code) === 4401) {
						handleFinalUnauthorized("ws");
						this.socket = null;
						this.connectPromise = null;
						this.setStatus("error");
						reject(createDisconnectErrorFromClose(event));
						return;
					}
					if (!this.expectedClose && (await retryHandshakeWithFreshToken())) {
						resolve();
						return;
					}
					if (!isActiveHandshake()) {
						this.connectPromise = null;
						reject(inactiveConnectionError());
						return;
					}
					this.connectPromise = null;
					if (!this.expectedClose) {
						this.setStatus("error");
						this.scheduleReconnect(this.shouldRefreshTokenForClose(event));
					} else {
						this.setStatus("disconnected");
					}
					reject(
						toWsConnectionError(createDisconnectErrorFromClose(event), {
							hasAccessToken: this.hasConnectionCredentials(),
						}),
					);
				})();
			};

			socket.addEventListener("open", handleOpen);
			socket.addEventListener("error", handleError);
			socket.addEventListener("close", handleCloseBeforeOpen);
		});
		let trackedConnectPromise: Promise<void> | null = null;
		trackedConnectPromise = pendingConnectPromise.finally(() => {
			if (trackedConnectPromise && this.connectPromise === trackedConnectPromise) {
				this.connectPromise = null;
			}
		});
		this.connectPromise = trackedConnectPromise;

		return this.waitForConnection(signal);
	}

	private waitForConnection(signal?: AbortSignal): Promise<void> {
		if (!this.connectPromise) {
			return Promise.resolve();
		}
		if (!signal) {
			return this.connectPromise;
		}

		return new Promise<void>((resolve, reject) => {
			const abortHandler = () => {
				signal.removeEventListener("abort", abortHandler);
				reject(new DOMException("The operation was aborted.", "AbortError"));
			};

			if (signal.aborted) {
				abortHandler();
				return;
			}

			signal.addEventListener("abort", abortHandler, { once: true });
			this.connectPromise!
				.then(() => {
					signal.removeEventListener("abort", abortHandler);
					resolve();
				})
				.catch((error) => {
					signal.removeEventListener("abort", abortHandler);
					reject(error);
				});
		});
	}

	private readonly handleMessage = (event: { data?: unknown }) => {
		const raw = typeof event.data === "string" ? event.data : String(event.data);
		let frame: WsInboundFrame;

		try {
			const parsed = JSON.parse(raw) as unknown;
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				return;
			}
			frame = parsed as WsInboundFrame;
		} catch {
			console.warn(
				"[WsClient] Failed to parse incoming frame:",
				raw.slice(0, 200),
			);
			return;
		}
		if (!["request", "response", "stream", "push", "error"].includes(frame.frame)) {
			return;
		}
		this.lastSeenAt = Date.now();
		if (frame.frame === "push" && frame.type === "connected") {
			try {
				this.socket?.close(1002, "duplicate connected handshake");
			} catch {
				// The close listener owns permanent cleanup.
			}
			return;
		}
		if (frame.frame === "push" && frame.type === "heartbeat") {
			const payload = frame.data;
			const heartbeat = payload && typeof payload === "object" && !Array.isArray(payload)
				? payload as Record<string, unknown>
				: null;
			const sequence = safeInteger(heartbeat?.sequence);
			const timestamp = safeInteger(heartbeat?.timestamp);
			if (
				!heartbeat || String(heartbeat.sessionId || "").trim() !== this.platformSessionId ||
				sequence === null || sequence <= this.lastHeartbeatSequence || timestamp === null
			) {
				try {
					this.socket?.close(1002, "invalid protocol-v2 heartbeat");
				} catch {
					// The close listener owns permanent cleanup.
				}
				return;
			}
			this.lastHeartbeatSequence = sequence;
			return;
		}

		if (
			(frame.frame === "error" || frame.frame === "response") &&
			isWsAuthenticationRequired(frame)
		) {
			handleFinalUnauthorized("ws");
		}

		if (frame.frame === "request") {
			void this.handleInboundRequest(frame);
			return;
		}

		this.dispatchPlatformFrame(frame, raw);
		if (frame.frame === "error" && !frame.id) {
			this.setStatus("error");
		}
	};

	private readonly handleClose = (event?: CloseEvent) => {
		this.clearHealthCheckTimer();
		this.inboundRequestGeneration += 1;
		this.seenInboundRequestIds.clear();
		this.socket?.removeEventListener("message", this.handleMessage);
		this.socket?.removeEventListener("close", this.handleClose);
		this.socket?.removeEventListener("error", this.handleSocketError);
		this.socket = null;
		this.connectPromise = null;
		this.platformSessionId = "";
		this.lastHeartbeatSequence = 0;

		if (this.disposed || this.expectedClose) {
			this.expectedClose = false;
			this.setStatus("disconnected");
			return;
		}
		if (isGatewayBackendMode() && Number(event?.code) === 4401) {
			handleFinalUnauthorized("ws");
			this.setStatus("error");
			this.failPlatformFrames(createDisconnectErrorFromClose(event));
			return;
		}

		this.setStatus("error");
		this.failPlatformFrames(createDisconnectErrorFromClose(event));
		this.scheduleReconnect(this.shouldRefreshTokenForClose(event));
	};

	private readonly handleSocketError = () => {
		if (this.disposed) {
			return;
		}
		if (this.status !== "connecting") {
			this.setStatus("error");
		}
		if (this.socket?.readyState === WS_SOCKET_OPEN) {
			try {
				this.socket.close(4002, "socket error");
			} catch {
				// Ignore close failures; the close handler will clean up if it fires.
			}
		}
	};

	private async handleInboundRequest(
		frame: WsInboundRequestFrame,
	): Promise<void> {
		const id = typeof frame.id === "string" ? frame.id.trim() : "";
		const type = typeof frame.type === "string" ? frame.type.trim() : "";
		if (!id) {
			this.trySendOutboundFrame({
				frame: "error",
				type: "invalid_request",
				code: 400,
				msg: "id is required",
			});
			return;
		}
		if (this.seenInboundRequestIds.has(id)) {
			this.trySendOutboundFrame({
				frame: "error",
				type: "duplicate_id",
				id,
				code: 409,
				msg: "request id was already used on this connection",
			});
			return;
		}
		this.seenInboundRequestIds.add(id);
		if (!type) {
			this.trySendOutboundFrame({
				frame: "error",
				type: "invalid_request",
				id,
				code: 400,
				msg: "type is required",
			});
			return;
		}
		const handler = this.inboundRequestHandlers.get(type);
		if (!handler) {
			this.trySendOutboundFrame({
				frame: "error",
				type: "unknown_request_type",
				id,
				code: 404,
				msg: `unknown request type: ${type}`,
			});
			return;
		}
		const generation = this.inboundRequestGeneration;
		try {
			const data = await handler(frame.payload);
			if (generation !== this.inboundRequestGeneration) {
				return;
			}
			this.trySendOutboundFrame({
				frame: "response",
				type,
				id,
				code: 0,
				msg: "success",
				...(data === undefined ? {} : { data }),
			});
		} catch (error) {
			if (generation !== this.inboundRequestGeneration) {
				return;
			}
			const requestError =
				error instanceof WsInboundRequestError
					? error
					: new WsInboundRequestError(
							"internal_error",
							500,
							"WebClient action request failed",
						);
			this.trySendOutboundFrame({
				frame: "error",
				type: requestError.type,
				id,
				code: requestError.code,
				msg: requestError.message,
				...(requestError.data === undefined
					? {}
					: { data: requestError.data }),
			});
		}
	}

	protected sendRequestFrame(frame: AgentPlatformRequestFrame): void {
		this.sendOutboundFrame(frame);
	}

	private trySendOutboundFrame(frame: WsOutboundFrame): boolean {
		try {
			this.sendOutboundFrame(frame);
			return true;
		} catch {
			return false;
		}
	}

	private sendOutboundFrame(frame: WsOutboundFrame): void {
		if (this.disposed) {
			throw this.createDisposedError();
		}
		if (!this.socket || this.socket.readyState !== WS_SOCKET_OPEN) {
			throw new WsClientDisconnectedError("WebSocket transport is not connected");
		}
		this.socket.send(JSON.stringify(frame));
	}

	private createDisposedError(): WsClientDisconnectedError {
		return new WsClientDisconnectedError("WebSocket client disposed");
	}

	private setStatus(status: WsConnectionStatus): void {
		this.status = status;
		this.onStatusChange?.(status);
	}

	private shouldRefreshTokenForClose(
		event?: Pick<CloseEvent, "code" | "reason">,
	): boolean {
		if (isGatewayBackendMode()) {
			return false;
		}
		if (isHeartbeatTimeoutClose(event)) {
			return false;
		}
		const reason = normalizeWsCloseReason(event?.reason).toLowerCase();
		const code = Number(event?.code ?? 0);
		return (
			code === 1002 ||
			code === 1006 ||
			code === 1008 ||
			code === 1011 ||
			code >= 4000 ||
			reason.includes("token") ||
			reason.includes("unauthorized") ||
			reason.includes("invalid") ||
			reason.includes("protocol")
		);
	}

	private async refreshAccessToken(
		reason: WsAccessTokenRefreshReason,
	): Promise<string> {
		if (this.disposed) {
			throw this.createDisposedError();
		}
		if (!this.resolveAccessToken) {
			return this.accessToken;
		}
		if (!this.accessTokenRefreshPromise) {
			this.accessTokenRefreshPromise = Promise.resolve(
				this.resolveAccessToken(reason),
			)
				.then((token) => {
					if (this.disposed) {
						throw this.createDisposedError();
					}
					const normalized = String(token || "").trim();
					if (normalized || reason === "unauthorized") {
						this.accessToken = normalized;
						this.onAccessTokenChange?.(normalized);
					}
					return normalized;
				})
				.finally(() => {
					this.accessTokenRefreshPromise = null;
				});
		}
		return this.accessTokenRefreshPromise;
	}

	private scheduleReconnect(forceRefreshToken = false): void {
		if (this.disposed || this.reconnectTimer || this.expectedClose) {
			return;
		}

		const reconnectAttempt = this.reconnectAttempt + 1;
		const shouldRefreshToken =
			Boolean(this.resolveAccessToken) &&
			(forceRefreshToken ||
				reconnectAttempt >= this.reconnectTokenRefreshThreshold);
		const lifecycleVersion = this.lifecycleVersion;
		const delay = Math.min(
			this.reconnectBaseDelayMs * 2 ** this.reconnectAttempt,
			this.reconnectMaxDelayMs,
		);
		this.reconnectAttempt += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
				if (typeof window === "undefined") {
				return;
			}
			void (async () => {
				if (this.lifecycleVersion !== lifecycleVersion || this.expectedClose) {
					return;
				}
				if (this.disposed) {
					return;
				}
				if (shouldRefreshToken) {
					const refreshedToken = await this.refreshAccessToken("unauthorized");
					if (!refreshedToken) {
						this.setStatus("error");
						return;
					}
				}
				if (
					this.disposed ||
					this.lifecycleVersion !== lifecycleVersion ||
					this.expectedClose
				) {
					return;
				}
				await this.connect();
			})().catch((error) => {
				if (isWsConnectionFailure(error)) {
					return;
				}
				console.warn("[WsClient] Reconnect attempt failed:", error);
			});
		}, delay);
	}

	private clearReconnectTimer(): void {
		if (!this.reconnectTimer) {
			return;
		}
		clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
	}

	private startHealthCheck(): void {
		this.clearHealthCheckTimer();
		this.healthCheckTimer = setInterval(() => {
			if (!this.socket || this.socket.readyState !== WS_SOCKET_OPEN) {
				return;
			}
			if (Date.now() - this.lastSeenAt <= this.heartbeatTimeoutMs) {
				return;
			}
			try {
				this.socket.close(
					WS_HEARTBEAT_TIMEOUT_CLOSE_CODE,
					WS_HEARTBEAT_TIMEOUT_CLOSE_REASON,
				);
			} catch {
				// Ignore close failures and let the socket tear down naturally.
			}
		}, this.healthCheckIntervalMs);
	}

	private clearHealthCheckTimer(): void {
		if (!this.healthCheckTimer) {
			return;
		}
		clearInterval(this.healthCheckTimer);
		this.healthCheckTimer = null;
	}
}

export { StandaloneSocketDriver as WsClient };
