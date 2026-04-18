export const VOICE_WS_CONNECT_TIMEOUT_MS = 8000;

export interface VoiceSocketContext {
	socket: WebSocket | null;
	socketConnectingPromise: Promise<WebSocket> | null;
	socketClosingExpected: boolean;
	outboundQueue: string[];
	appendDebug: (message: string) => void;
	setDebugStatus: (status: string) => void;
	markUncommittedSessionsError: (message: string) => void;
	getAccessToken: () => string;
	getVoiceWsUrl: (accessToken: string) => string;
	describeVoiceWsTarget: (accessToken: string) => string;
	handleSocketBinary: (data: unknown) => void;
	handleTaskStarted: (taskId: string, payload: Record<string, unknown>) => void;
	handleTaskAudioFormat: (taskId: string, payload: Record<string, unknown>) => void;
	handleTaskAudioChunk: (taskId: string, payload: Record<string, unknown>) => void;
	handleTaskDone: (taskId: string, payload: Record<string, unknown>) => void;
	handleTaskStopped: (taskId: string, payload: Record<string, unknown>) => void;
	handleTaskError: (
		taskId: string,
		message: string,
		code: string,
		payload: Record<string, unknown>,
	) => void;
}

export function handleSocketText(
	context: VoiceSocketContext,
	rawText: string,
): void {
	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(rawText);
	} catch (error) {
		context.appendDebug(
			`voice ws text parse failed: ${(error as Error).message}`,
		);
		return;
	}

	const type = String(payload?.type || "").trim();
	const taskId = String(payload?.taskId || "").trim();

	switch (type) {
		case "connection.ready":
			return;
		case "task.started":
			if (taskId) context.handleTaskStarted(taskId, payload);
			return;
		case "tts.audio.format":
			if (taskId) context.handleTaskAudioFormat(taskId, payload);
			return;
		case "tts.audio.chunk":
			if (taskId) context.handleTaskAudioChunk(taskId, payload);
			return;
		case "tts.done":
			if (taskId) context.handleTaskDone(taskId, payload);
			return;
		case "task.stopped":
			if (taskId) context.handleTaskStopped(taskId, payload);
			return;
		case "error": {
			const message = String(payload?.message || "voice websocket error");
			const code = String(payload?.code || "").trim();
			context.handleTaskError(taskId, message, code, payload);
			context.appendDebug(
				code
					? `voice ws error (${code}): ${message}`
					: `voice ws error: ${message}`,
			);
			return;
		}
		default:
			return;
	}
}

export function flushOutboundQueue(context: VoiceSocketContext): void {
	if (!context.socket || context.socket.readyState !== context.socket.OPEN) {
		return;
	}
	while (context.outboundQueue.length > 0) {
		const frame = context.outboundQueue.shift();
		if (frame) context.socket.send(frame);
	}
}

export function ensureSocket(
	context: VoiceSocketContext,
): Promise<WebSocket> {
	if (context.socket && context.socket.readyState === context.socket.OPEN) {
		return Promise.resolve(context.socket);
	}
	if (context.socketConnectingPromise) return context.socketConnectingPromise;

	const accessToken = context.getAccessToken();
	if (!accessToken) {
		const errorMessage = "voice access_token is required";
		context.outboundQueue.length = 0;
		context.markUncommittedSessionsError(errorMessage);
		context.setDebugStatus(`error: ${errorMessage}`);
		return Promise.reject(new Error(errorMessage));
	}

	const WsCtor = globalThis.window?.WebSocket || globalThis.WebSocket;
	if (!WsCtor) return Promise.reject(new Error("WebSocket is not available"));

	context.socketClosingExpected = false;
	context.socketConnectingPromise = new Promise((resolve, reject) => {
		let connected = false;
		let settled = false;
		const targetSummary = context.describeVoiceWsTarget(accessToken);
		const connectTimeout = globalThis.window?.setTimeout
			? globalThis.window.setTimeout(() => {
					context.appendDebug(`voice ws connect timeout: ${targetSummary}`);
					failPendingConnect("voice websocket connect timeout");
			  }, VOICE_WS_CONNECT_TIMEOUT_MS)
			: null;

		const clearConnectTimeout = (): void => {
			if (connectTimeout !== null && globalThis.window?.clearTimeout) {
				globalThis.window.clearTimeout(connectTimeout);
			}
		};

		const failPendingConnect = (message: string): void => {
			if (settled) return;
			settled = true;
			clearConnectTimeout();
			context.socketConnectingPromise = null;
			const failedSocket = context.socket;
			context.socket = null;
			context.markUncommittedSessionsError(message);
			context.setDebugStatus(`error: ${message}`);
			reject(new Error(message));
			if (
				failedSocket &&
				failedSocket.readyState === failedSocket.CONNECTING
			) {
				context.socketClosingExpected = true;
				try {
					failedSocket.close(1000, "voice connect failed");
				} catch {
					/* no-op */
				}
			}
		};

		try {
			context.appendDebug(`voice ws connect -> ${targetSummary}`);
			context.socket = new WsCtor(context.getVoiceWsUrl(accessToken));
		} catch (error) {
			clearConnectTimeout();
			context.socketConnectingPromise = null;
			reject(error as Error);
			return;
		}

		context.socket.binaryType = "arraybuffer";
		context.socket.addEventListener("open", () => {
			if (settled) return;
			settled = true;
			connected = true;
			clearConnectTimeout();
			context.socketConnectingPromise = null;
			flushOutboundQueue(context);
			resolve(context.socket as WebSocket);
		});

		context.socket.addEventListener("message", (event: MessageEvent) => {
			if (typeof event.data === "string") {
				handleSocketText(context, event.data);
				return;
			}
			context.handleSocketBinary(event.data);
		});

		context.socket.addEventListener("error", () => {
			context.appendDebug("voice ws error event");
			failPendingConnect("voice websocket handshake failed");
		});

		context.socket.addEventListener("close", (event: CloseEvent) => {
			const expected = context.socketClosingExpected;
			context.socketClosingExpected = false;
			const closeCode =
				typeof event?.code === "number" ? event.code : 1006;
			const closeReason = String(event?.reason || "").trim();
			if (!connected && !expected) {
				const detail = closeReason
					? `voice websocket closed before open (code=${closeCode}, reason=${closeReason})`
					: `voice websocket closed before open (code=${closeCode})`;
				context.appendDebug(detail);
				failPendingConnect(detail);
				return;
			}
			context.socketConnectingPromise = null;
			context.socket = null;
			clearConnectTimeout();
			if (!expected) {
				context.markUncommittedSessionsError("voice websocket closed");
				context.setDebugStatus("error: voice websocket closed");
			}
		});
	});

	return context.socketConnectingPromise;
}

export function sendJsonFrame(
	context: VoiceSocketContext,
	payload: Record<string, unknown>,
): void {
	const frame = JSON.stringify(payload);
	if (context.socket && context.socket.readyState === context.socket.OPEN) {
		context.socket.send(frame);
		return;
	}
	context.outboundQueue.push(frame);
	ensureSocket(context).catch((error) => {
		context.appendDebug(
			`voice socket connect failed: ${(error as Error).message}`,
		);
		context.setDebugStatus(`error: ${(error as Error).message}`);
	});
}

export function closeSocket(context: VoiceSocketContext): void {
	if (!context.socket) {
		context.socketConnectingPromise = null;
		return;
	}
	context.socketClosingExpected = true;
	try {
		if (
			context.socket.readyState === context.socket.OPEN ||
			context.socket.readyState === context.socket.CONNECTING
		) {
			context.socket.close(1000, "voice reset");
		}
	} catch {
		/* no-op */
	}
	context.socket = null;
	context.socketConnectingPromise = null;
}
