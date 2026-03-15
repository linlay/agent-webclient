import type { TtsVoiceBlock } from "../context/types";
import { DEFAULT_CHANNELS, DEFAULT_SAMPLE_RATE } from "./voiceAudioPlayer";

export const VOICE_WS_CONNECT_TIMEOUT_MS = 8000;

export interface VoiceSocketContext {
	socket: WebSocket | null;
	socketConnectingPromise: Promise<WebSocket> | null;
	socketClosingExpected: boolean;
	outboundQueue: string[];
	debugTtsRequest: { requestId: string; started: boolean; audioFrames: number; audioBytes: number } | null;
	activeAudioRequestId: string;
	activeSampleRate: number;
	activeChannels: number;
	appendDebug: (message: string) => void;
	setDebugStatus: (status: string) => void;
	setDebugStatusWithStats: (status: string) => void;
	handleSocketBinary: (data: unknown) => void;
	updateBlockByRequestId: (requestId: string, patch: Partial<TtsVoiceBlock>) => void;
	markUncommittedSessionsError: (message: string) => void;
	getAccessToken: () => string;
	getVoiceWsUrl: (accessToken: string) => string;
	describeVoiceWsTarget: (accessToken: string) => string;
}

export function handleSocketText(context: VoiceSocketContext, rawText: string): void {
	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(rawText);
	} catch (error) {
		context.appendDebug(`voice ws text parse failed: ${(error as Error).message}`);
		return;
	}

	const type = String(payload?.type || "").trim();
	const requestId = String(payload?.requestId || "").trim();

	if (type === "tts.started") {
		if (requestId) {
			context.activeAudioRequestId = requestId;
			context.activeSampleRate = Number(payload.sampleRate) || DEFAULT_SAMPLE_RATE;
			context.activeChannels = Number(payload.channels) || DEFAULT_CHANNELS;
			if (context.debugTtsRequest?.requestId === requestId) {
				context.debugTtsRequest.started = true;
				context.setDebugStatusWithStats("tts started");
			}
			context.updateBlockByRequestId(requestId, {
				status: "playing",
				error: "",
				sampleRate: context.activeSampleRate,
				channels: context.activeChannels,
			});
		}
		return;
	}

	if (type === "tts.done") {
		if (requestId) {
			context.updateBlockByRequestId(requestId, { status: "done", error: "" });
			if (context.debugTtsRequest?.requestId === requestId) {
				if (context.debugTtsRequest.audioFrames > 0) {
					context.setDebugStatusWithStats("done");
				} else if (context.debugTtsRequest.started) {
					context.setDebugStatus("connected but no audio frames");
				} else {
					context.setDebugStatus("done");
				}
			}
		}
		return;
	}

	if (type === "tts.interrupted") {
		if (requestId) {
			context.updateBlockByRequestId(requestId, { status: "stopped" });
			if (context.debugTtsRequest?.requestId === requestId) context.setDebugStatus("stopped");
		}
		return;
	}

	if (type === "error") {
		const message = String(payload?.message || "voice websocket error");
		if (requestId) {
			context.updateBlockByRequestId(requestId, { status: "error", error: message });
			if (context.debugTtsRequest?.requestId === requestId) context.setDebugStatus(`error: ${message}`);
		} else {
			context.markUncommittedSessionsError(message);
			context.setDebugStatus(`error: ${message}`);
		}
		context.appendDebug(`voice ws error: ${message}`);
	}
}

export function flushOutboundQueue(context: VoiceSocketContext): void {
	if (!context.socket || context.socket.readyState !== context.socket.OPEN) return;
	while (context.outboundQueue.length > 0) {
		const frame = context.outboundQueue.shift();
		if (frame) context.socket.send(frame);
	}
}

export function ensureSocket(context: VoiceSocketContext): Promise<WebSocket> {
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
			if (failedSocket && failedSocket.readyState === failedSocket.CONNECTING) {
				context.socketClosingExpected = true;
				try { failedSocket.close(1000, "voice connect failed"); } catch { /* no-op */ }
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
			if (context.debugTtsRequest?.requestId) {
				context.setDebugStatus("socket open");
			}
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
			const closeCode = typeof event?.code === "number" ? event.code : 1006;
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

export function sendJsonFrame(context: VoiceSocketContext, payload: Record<string, unknown>): void {
	const frame = JSON.stringify(payload);
	if (context.socket && context.socket.readyState === context.socket.OPEN) {
		context.socket.send(frame);
		return;
	}
	context.outboundQueue.push(frame);
	ensureSocket(context).catch((error) => {
		context.appendDebug(`voice socket connect failed: ${(error as Error).message}`);
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
		if (context.socket.readyState === context.socket.OPEN || context.socket.readyState === context.socket.CONNECTING) {
			context.socket.close(1000, "voice reset");
		}
	} catch {
		/* no-op */
	}
	context.socket = null;
	context.socketConnectingPromise = null;
}
