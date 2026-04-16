import type { AgentEvent } from "../context/types";
import { ApiError, createRequestId, type ApiResponse } from "./apiClient";

export type WsConnectionStatus =
	| "disconnected"
	| "connecting"
	| "connected"
	| "error";

interface WsRequestFrame {
	frame: "request";
	type: string;
	id: string;
	payload?: unknown;
}

interface WsResponseFrame {
	frame: "response";
	id?: string;
	code?: number | string;
	status?: number;
	msg?: string;
	data?: unknown;
}

interface WsStreamEventFrame {
	type?: string;
	seq?: number;
	payload?: unknown;
	[key: string]: unknown;
}

interface WsStreamFrame {
	frame: "stream";
	id?: string;
	event?: WsStreamEventFrame;
	reason?: string;
}

interface WsPushFrame {
	frame: "push";
	type?: string;
	payload?: unknown;
	[key: string]: unknown;
}

interface WsErrorFrame {
	frame: "error";
	id?: string;
	code?: number | string;
	status?: number;
	msg?: string;
	error?: string;
	data?: unknown;
}

type WsInboundFrame = WsResponseFrame | WsStreamFrame | WsPushFrame | WsErrorFrame;

type PendingRequest = {
	resolve: (value: ApiResponse) => void;
	reject: (reason?: unknown) => void;
	abortHandler?: () => void;
	timer?: ReturnType<typeof setTimeout>;
};

type ActiveStream = {
	onEvent: (event: AgentEvent) => void;
	onFrame?: (raw: string) => void;
	onError?: (err: Error) => void;
	onDone?: () => void;
	reject: (reason?: unknown) => void;
	abortHandler?: () => void;
	signal?: AbortSignal;
};

export interface WsClientOptions {
	accessToken?: string;
	onStatusChange?: (status: WsConnectionStatus) => void;
	onPush?: (frame: WsPushFrame) => void;
	heartbeatTimeoutMs?: number;
	reconnectBaseDelayMs?: number;
	reconnectMaxDelayMs?: number;
	healthCheckIntervalMs?: number;
	requestTimeoutMs?: number;
}

export class WsClientDisconnectedError extends Error {
	code: string;

	constructor(message = "WebSocket transport disconnected") {
		super(message);
		this.name = "WsClientDisconnectedError";
		this.code = "WS_DISCONNECTED";
	}
}

export class WsClientRequestTimeoutError extends Error {
	code: string;

	constructor(message = "WebSocket request timeout") {
		super(message);
		this.name = "WsClientRequestTimeoutError";
		this.code = "WS_REQUEST_TIMEOUT";
	}
}

export function isWsTransportError(
	error: unknown,
): error is WsClientDisconnectedError | WsClientRequestTimeoutError {
	return (
		error instanceof WsClientDisconnectedError ||
		error instanceof WsClientRequestTimeoutError
	);
}

export interface WsConnectionErrorOptions {
	appMode?: boolean;
	hasAccessToken?: boolean;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === "object";
}

function hasHelpfulWsMessage(message: string): boolean {
	return (
		message.startsWith("缺少 Access Token") ||
		message.startsWith("WebSocket 握手失败") ||
		message.startsWith("WebSocket 传输尚未初始化")
	);
}

function missingAccessTokenMessage(appMode = false): string {
	return appMode
		? "缺少 Access Token，无法建立 WebSocket 连接。请确认宿主应用已提供有效令牌。"
		: "缺少 Access Token，无法建立 WebSocket 连接。请先在设置中填写有效令牌。";
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
		message === "WebSocket transport disconnected" ||
		message === "WebSocket transport is not initialized"
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
		return "WebSocket 握手失败，请检查 Access Token 是否有效，并确认后端已启用 /ws。";
	}
	if (hasHelpfulWsMessage(rawMessage)) {
		return rawMessage;
	}
	if (rawMessage === "WebSocket transport is not initialized") {
		return "WebSocket 传输尚未初始化，请先切换到 WebSocket 模式并确认连接成功。";
	}
	if (
		rawMessage === "WebSocket connection failed" ||
		rawMessage === "WebSocket transport disconnected"
	) {
		return "WebSocket 握手失败，请检查 Access Token 是否有效，并确认后端已启用 /ws。";
	}
	return rawMessage.startsWith("WebSocket ")
		? rawMessage
		: `WebSocket 连接失败：${rawMessage}`;
}

export function toWsConnectionError(
	error: unknown,
	options: WsConnectionErrorOptions = {},
): Error {
	const message = describeWsConnectionFailure(error, options);
	if (error instanceof Error && error.message === message) {
		return error;
	}
	return new Error(message);
}

function buildWsUrl(accessToken = ""): string {
	const protocol =
		window.location.protocol === "https:" ? "wss:" : "ws:";
	const url = new URL(`${protocol}//${window.location.host}/ws`);
	const normalizedToken = String(accessToken || "").trim();
	if (normalizedToken) {
		url.searchParams.set("token", normalizedToken);
	}
	return url.toString();
}

function frameErrorMessage(frame: WsErrorFrame | WsResponseFrame): string {
	const explicit = String(
		frame.msg || ("error" in frame ? frame.error : "") || "",
	).trim();
	if (explicit) {
		return explicit;
	}
	if (frame.status) {
		return `WebSocket request failed (${frame.status})`;
	}
	if (frame.code != null) {
		return `WebSocket request failed (code=${String(frame.code)})`;
	}
	return "WebSocket request failed";
}

function toApiError(frame: WsErrorFrame | WsResponseFrame): ApiError {
	return new ApiError(frameErrorMessage(frame), {
		status: frame.status ?? null,
		code: frame.code ?? null,
		data: frame.data ?? null,
	});
}

function toApiResponse<T>(frame: WsResponseFrame): ApiResponse<T> {
	const code =
		typeof frame.code === "number"
			? frame.code
			: Number.isFinite(Number(frame.code))
				? Number(frame.code)
				: 0;

	if (code !== 0) {
		throw toApiError(frame);
	}

	return {
		status: typeof frame.status === "number" ? frame.status : 200,
		code,
		msg: typeof frame.msg === "string" ? frame.msg : "ok",
		data: (frame.data ?? null) as T,
	};
}

function toAgentEvent(frameEvent: WsStreamEventFrame): AgentEvent {
	const { payload, ...rest } = frameEvent;
	const payloadRecord = isObjectRecord(payload) ? payload : {};
	return {
		...payloadRecord,
		...rest,
		type: String(frameEvent.type || payloadRecord.type || ""),
		seq:
			typeof frameEvent.seq === "number"
				? frameEvent.seq
				: Number(payloadRecord.seq ?? 0) || undefined,
	} as AgentEvent;
}

export class WsClient {
	private accessToken: string;
	private socket: WebSocket | null = null;
	private connectPromise: Promise<void> | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
	private reconnectAttempt = 0;
	private lastSeenAt = 0;
	private expectedClose = false;
	private status: WsConnectionStatus = "disconnected";
	private readonly pendingRequests = new Map<string, PendingRequest>();
	private readonly activeStreams = new Map<string, ActiveStream>();
	private onStatusChange?: (status: WsConnectionStatus) => void;
	private onPush?: (frame: WsPushFrame) => void;
	private readonly heartbeatTimeoutMs: number;
	private readonly reconnectBaseDelayMs: number;
	private readonly reconnectMaxDelayMs: number;
	private readonly healthCheckIntervalMs: number;
	private readonly requestTimeoutMs: number;

	constructor(options: WsClientOptions = {}) {
		this.accessToken = String(options.accessToken || "").trim();
		this.onStatusChange = options.onStatusChange;
		this.onPush = options.onPush;
		this.heartbeatTimeoutMs = Math.max(1000, options.heartbeatTimeoutMs ?? 45_000);
		this.reconnectBaseDelayMs = Math.max(100, options.reconnectBaseDelayMs ?? 1_000);
		this.reconnectMaxDelayMs = Math.max(
			this.reconnectBaseDelayMs,
			options.reconnectMaxDelayMs ?? 30_000,
		);
		this.healthCheckIntervalMs = Math.max(
			1000,
			options.healthCheckIntervalMs ?? 5_000,
		);
		this.requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? 30_000);
	}

	updateOptions(options: Partial<WsClientOptions> = {}): void {
		if (options.accessToken !== undefined) {
			this.accessToken = String(options.accessToken || "").trim();
		}
		if (options.onStatusChange !== undefined) {
			this.onStatusChange = options.onStatusChange;
		}
		if (options.onPush !== undefined) {
			this.onPush = options.onPush;
		}
	}

	connect(): Promise<void> {
		return this.ensureConnected();
	}

	disconnect(): void {
		this.expectedClose = true;
		this.clearReconnectTimer();
		this.clearHealthCheckTimer();
		this.cleanupPending(new WsClientDisconnectedError("WebSocket transport disconnected"));

		if (this.socket) {
			try {
				if (
					this.socket.readyState === WebSocket.OPEN ||
					this.socket.readyState === WebSocket.CONNECTING
				) {
					this.socket.close(1000, "ws transport disconnect");
				}
			} catch {
				// Ignore close failures from a half-open socket.
			}
		}

		this.socket = null;
		this.connectPromise = null;
		this.reconnectAttempt = 0;
		this.setStatus("disconnected");
	}

	getStatus(): WsConnectionStatus {
		return this.status;
	}

	async request<T>(opts: {
		type: string;
		payload?: unknown;
		signal?: AbortSignal;
	}): Promise<ApiResponse<T>> {
		await this.ensureConnected(opts.signal);
		const id = createRequestId("wsreq");

		return new Promise<ApiResponse<T>>((resolve, reject) => {
			const cleanup = () => {
				const current = this.pendingRequests.get(id);
				if (current?.timer) {
					clearTimeout(current.timer);
				}
				if (current?.abortHandler && opts.signal) {
					opts.signal.removeEventListener("abort", current.abortHandler);
				}
				this.pendingRequests.delete(id);
			};

			const abortHandler = () => {
				cleanup();
				reject(new DOMException("The operation was aborted.", "AbortError"));
			};

			if (opts.signal?.aborted) {
				abortHandler();
				return;
			}

			if (opts.signal) {
				opts.signal.addEventListener("abort", abortHandler, { once: true });
			}

			this.pendingRequests.set(id, {
				resolve: (value) => {
					cleanup();
					resolve(value as ApiResponse<T>);
				},
				reject: (reason) => {
					cleanup();
					reject(reason);
				},
				abortHandler,
				timer: setTimeout(() => {
					cleanup();
					reject(
						new WsClientRequestTimeoutError(
							`WebSocket request timeout: ${opts.type}`,
						),
					);
				}, this.requestTimeoutMs),
			});

			try {
				this.sendFrame({
					frame: "request",
					type: opts.type,
					id,
					payload: opts.payload,
				});
			} catch (error) {
				cleanup();
				reject(error);
			}
		});
	}

	stream(opts: {
		type: string;
		payload: unknown;
		signal?: AbortSignal;
		onEvent: (event: AgentEvent) => void;
		onFrame?: (raw: string) => void;
		onError?: (err: Error) => void;
		onDone?: () => void;
	}): { abort: () => void } {
		const id = createRequestId("wsstream");
		let aborted = false;

		const abort = () => {
			if (aborted) {
				return;
			}
			aborted = true;
			this.cleanupStream(id, opts.signal);
		};

		const abortHandler = () => {
			abort();
			opts.onError?.(new DOMException("The operation was aborted.", "AbortError"));
		};

		if (opts.signal?.aborted) {
			abortHandler();
			return { abort };
		}

		this.activeStreams.set(id, {
			onEvent: opts.onEvent,
			onFrame: opts.onFrame,
			onError: opts.onError,
			onDone: opts.onDone,
			reject: (reason) => {
				abort();
				if (reason instanceof Error) {
					opts.onError?.(reason);
					return;
				}
				opts.onError?.(new Error(String(reason || "WebSocket stream failed")));
			},
			abortHandler,
			signal: opts.signal,
		});

		if (opts.signal) {
			opts.signal.addEventListener("abort", abortHandler, { once: true });
		}

		void this.ensureConnected(opts.signal)
			.then(() => {
				if (aborted || !this.activeStreams.has(id)) {
					return;
				}
				this.sendFrame({
					frame: "request",
					type: opts.type,
					id,
					payload: opts.payload,
				});
			})
			.catch((error) => {
				abort();
				opts.onError?.(
					error instanceof Error ? error : new Error(String(error || "WebSocket stream failed")),
				);
			});

		return { abort };
	}

	private async ensureConnected(signal?: AbortSignal): Promise<void> {
		if (this.socket?.readyState === WebSocket.OPEN) {
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

		this.connectPromise = new Promise<void>((resolve, reject) => {
			const socket = new WebSocket(buildWsUrl(this.accessToken));
			this.socket = socket;

			const cleanupBeforeOpen = () => {
				socket.removeEventListener("open", handleOpen);
				socket.removeEventListener("error", handleError);
				socket.removeEventListener("close", handleCloseBeforeOpen);
			};

			const handleOpen = () => {
				cleanupBeforeOpen();
				socket.addEventListener("message", this.handleMessage);
				socket.addEventListener("close", this.handleClose);
				socket.addEventListener("error", this.handleSocketError);
				this.lastSeenAt = Date.now();
				this.reconnectAttempt = 0;
				this.startHealthCheck();
				this.setStatus("connected");
				resolve();
			};

			const handleError = () => {
				cleanupBeforeOpen();
				this.connectPromise = null;
				this.socket = null;
				this.setStatus("error");
				this.scheduleReconnect();
				reject(
					toWsConnectionError(new Error("WebSocket connection failed"), {
						hasAccessToken: Boolean(this.accessToken),
					}),
				);
			};

			const handleCloseBeforeOpen = () => {
				cleanupBeforeOpen();
				this.connectPromise = null;
				if (!this.expectedClose) {
					this.setStatus("error");
					this.scheduleReconnect();
				} else {
					this.setStatus("disconnected");
				}
				reject(
					toWsConnectionError(new WsClientDisconnectedError(), {
						hasAccessToken: Boolean(this.accessToken),
					}),
				);
			};

			socket.addEventListener("open", handleOpen);
			socket.addEventListener("error", handleError);
			socket.addEventListener("close", handleCloseBeforeOpen);
		}).finally(() => {
			this.connectPromise = null;
		});

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

	private readonly handleMessage = (event: MessageEvent) => {
		this.lastSeenAt = Date.now();
		const raw = typeof event.data === "string" ? event.data : String(event.data);
		let frame: WsInboundFrame;

		try {
			frame = JSON.parse(raw) as WsInboundFrame;
		} catch {
			console.warn(
				"[WsClient] Failed to parse incoming frame:",
				raw.slice(0, 200),
			);
			return;
		}

		if (frame.frame === "response") {
			const pending = frame.id ? this.pendingRequests.get(frame.id) : null;
			if (!pending || !frame.id) {
				return;
			}
			try {
				pending.resolve(toApiResponse(frame));
			} catch (error) {
				pending.reject(error);
			}
			return;
		}

		if (frame.frame === "stream") {
			const stream = frame.id ? this.activeStreams.get(frame.id) : null;
			if (!stream || !frame.id) {
				return;
			}
			stream.onFrame?.(raw);
			if (frame.event) {
				stream.onEvent(toAgentEvent(frame.event));
			}
			if (frame.reason === "done") {
				stream.onDone?.();
				this.cleanupStream(frame.id);
			}
			return;
		}

		if (frame.frame === "push") {
			this.onPush?.(frame);
			return;
		}

		if (frame.frame === "error") {
			const error = toApiError(frame);
			if (frame.id) {
				const pending = this.pendingRequests.get(frame.id);
				if (pending) {
					pending.reject(error);
					return;
				}
				const stream = this.activeStreams.get(frame.id);
				if (stream) {
					stream.reject(error);
					return;
				}
			}
			this.setStatus("error");
		}
	};

	private readonly handleClose = () => {
		this.clearHealthCheckTimer();
		this.socket?.removeEventListener("message", this.handleMessage);
		this.socket?.removeEventListener("close", this.handleClose);
		this.socket?.removeEventListener("error", this.handleSocketError);
		this.socket = null;
		this.connectPromise = null;

		if (this.expectedClose) {
			this.expectedClose = false;
			this.setStatus("disconnected");
			return;
		}

		this.setStatus("error");
		this.cleanupPending(new WsClientDisconnectedError());
		this.scheduleReconnect();
	};

	private readonly handleSocketError = () => {
		if (this.status !== "connecting") {
			this.setStatus("error");
		}
	};

	private sendFrame(frame: WsRequestFrame): void {
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
			throw new WsClientDisconnectedError("WebSocket transport is not connected");
		}
		this.socket.send(JSON.stringify(frame));
	}

	private setStatus(status: WsConnectionStatus): void {
		this.status = status;
		this.onStatusChange?.(status);
	}

	private cleanupPending(error: Error): void {
		for (const [id, pending] of this.pendingRequests.entries()) {
			pending.reject(error);
			this.pendingRequests.delete(id);
		}
		for (const [id, stream] of this.activeStreams.entries()) {
			stream.reject(error);
			this.activeStreams.delete(id);
		}
	}

	private cleanupStream(id: string, signal?: AbortSignal): void {
		const stream = this.activeStreams.get(id);
		if (!stream) {
			return;
		}
		const activeSignal = signal || stream.signal;
		if (stream.abortHandler && activeSignal) {
			activeSignal.removeEventListener("abort", stream.abortHandler);
		}
		this.activeStreams.delete(id);
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer || this.expectedClose) {
			return;
		}

		const delay = Math.min(
			this.reconnectBaseDelayMs * 2 ** this.reconnectAttempt,
			this.reconnectMaxDelayMs,
		);
		this.reconnectAttempt += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
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
			if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
				return;
			}
			if (Date.now() - this.lastSeenAt <= this.heartbeatTimeoutMs) {
				return;
			}
			try {
				this.socket.close(4000, "heartbeat timeout");
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
