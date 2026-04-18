import type { VoiceCapabilities } from "@/app/state/types";
import {
	cleanupVoiceAudioCapture,
	createVoiceAudioCaptureState,
	flushVoiceAudioCaptureRemainder,
	initializeVoiceAudioCapture,
	type VoiceAudioCaptureState,
} from "@/features/voice/lib/voiceAudioCapture";
import {
	buildVoiceAsrStartPayload,
	buildVoiceAsrStopFrames,
	mergeVoiceAsrDefaults,
	type VoiceAsrDefaultsInput,
	type VoiceAsrDefaults,
} from "@/features/voice/lib/voiceAsrProtocol";
import {
	bytesToBase64,
	describeVoiceChatWsTarget,
	resolveVoiceChatWsUrl,
} from "@/features/voice/lib/voiceChatAudio";

const DEFAULT_STOP_TIMEOUT_MS = 1000;

const INTERIM_EVENT_TYPES = new Set([
	"asr.text.delta",
	"asr.text.partial",
	"asr.text.interim",
]);

export interface AsrDebugStatePatch {
	status?: string;
	error?: string;
	interimText?: string;
	finalText?: string;
	recording?: boolean;
}

export interface AsrDebugSessionOptions {
	getAccessToken: () => string;
	getVoiceWsPath: () => string;
	getAsrDefaults: () => VoiceAsrDefaultsInput | undefined;
	onState: (patch: AsrDebugStatePatch) => void;
	appendDebug?: (line: string) => void;
	taskIdFactory?: () => string;
	stopTimeoutMs?: number;
	webSocketCtor?: typeof WebSocket;
	audioCaptureFactory?: () => VoiceAudioCaptureState;
	audioCaptureInitializer?: typeof initializeVoiceAudioCapture;
	audioCaptureCleanup?: typeof cleanupVoiceAudioCapture;
	audioCaptureFlush?: typeof flushVoiceAudioCaptureRemainder;
}

export class AsrDebugSession {
	private socket: WebSocket | null = null;
	private captureState: VoiceAudioCaptureState;
	private chunkCounter = 0;
	private currentTaskId = "";
	private finalText = "";
	private stopTimer: number | null = null;
	private stopping = false;
	private destroyed = false;
	private currentAsrDefaults: VoiceAsrDefaults = mergeVoiceAsrDefaults();
	private options: AsrDebugSessionOptions;

	constructor(options: AsrDebugSessionOptions) {
		this.options = options;
		this.captureState =
			options.audioCaptureFactory?.() || createVoiceAudioCaptureState();
	}

	private appendDebug(message: string): void {
		this.options.appendDebug?.(`[settings-asr] ${message}`);
	}

	private emitState(patch: AsrDebugStatePatch): void {
		if (this.destroyed) return;
		this.options.onState(patch);
	}

	private clearStopTimer(): void {
		if (this.stopTimer == null) return;
		const clearTimer =
			globalThis.window?.clearTimeout || globalThis.clearTimeout;
		clearTimer(this.stopTimer);
		this.stopTimer = null;
	}

	private getWebSocketCtor(): typeof WebSocket {
		const ctor =
			this.options.webSocketCtor || globalThis.window?.WebSocket || globalThis.WebSocket;
		if (!ctor) {
			throw new Error("WebSocket is not available");
		}
		return ctor;
	}

	private handleFailure(message: string): void {
		this.appendDebug(message);
		this.cleanupTransport();
		this.emitState({
			status: "error",
			error: message,
			recording: false,
		});
	}

	private cleanupTransport(): void {
		this.clearStopTimer();
		this.stopping = false;
		this.chunkCounter = 0;
		(
			this.options.audioCaptureCleanup || cleanupVoiceAudioCapture
		)(this.captureState);
		if (this.socket) {
			try {
				this.socket.close(1000, "settings asr cleanup");
			} catch {
				/* no-op */
			}
		}
		this.socket = null;
		this.currentTaskId = "";
		this.currentAsrDefaults = mergeVoiceAsrDefaults();
	}

	private sendJson(payload: Record<string, unknown>): void {
		if (!this.socket || this.socket.readyState !== this.socket.OPEN) {
			throw new Error("ASR 调试 WebSocket 尚未连接");
		}
		this.socket.send(JSON.stringify(payload));
	}

	private sendAudioChunk = (chunk: Uint8Array): void => {
		this.sendJson({
			type: "asr.audio.append",
			taskId: this.currentTaskId,
			audio: bytesToBase64(chunk),
		});
		this.chunkCounter += 1;
		if (this.chunkCounter === 1 || this.chunkCounter % 25 === 0) {
			this.appendDebug(`sent asr.audio.append (${this.chunkCounter})`);
		}
	};

	private scheduleStopFallback(): void {
		this.clearStopTimer();
		const setTimer = globalThis.window?.setTimeout || globalThis.setTimeout;
		this.stopTimer = setTimer(() => {
			this.appendDebug("stop fallback timeout reached, closing socket");
			this.cleanupTransport();
			this.emitState({
				status: "idle",
				recording: false,
				interimText: "",
			});
		}, this.options.stopTimeoutMs || DEFAULT_STOP_TIMEOUT_MS);
	}

	private async startCapture(): Promise<void> {
		const ok = await (
			this.options.audioCaptureInitializer || initializeVoiceAudioCapture
		)(
			this.captureState,
			this.sendAudioChunk,
			(message) => this.handleFailure(message),
			this.currentAsrDefaults.clientGate,
		);
		if (!ok) return;
		this.emitState({
			status: "recording",
			error: "",
			recording: true,
		});
	}

	private handleSocketMessage(rawData: unknown): void {
		if (typeof rawData !== "string") return;

		let message: Record<string, unknown>;
		try {
			message = JSON.parse(rawData) as Record<string, unknown>;
		} catch (error) {
			this.appendDebug(
				`message parse failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return;
		}

		const taskId = String(message.taskId || "").trim();
		const type = String(message.type || "").trim();
		if (taskId && taskId !== this.currentTaskId) {
			return;
		}

		if (type === "task.started") {
			this.appendDebug("received task.started");
			void this.startCapture();
			return;
		}

		if (INTERIM_EVENT_TYPES.has(type)) {
			this.emitState({
				status: "recording",
				error: "",
				interimText: String(message.text || ""),
				recording: true,
			});
			return;
		}

		if (type === "asr.text.final") {
			const next = String(message.text || "").trim();
			if (!next) return;
			this.finalText = this.finalText
				? `${this.finalText}\n${next}`
				: next;
			this.emitState({
				status: this.stopping ? "stopping" : "recording",
				error: "",
				interimText: "",
				finalText: this.finalText,
				recording: !this.stopping,
			});
			return;
		}

		if (type === "task.stopped") {
			this.appendDebug(`received task.stopped: ${String(message.reason || "")}`);
			this.cleanupTransport();
			this.emitState({
				status: "idle",
				error: "",
				interimText: "",
				recording: false,
			});
			return;
		}

		if (type === "error") {
			const code = String(message.code || "").trim();
			const detail = String(message.message || "ASR 调试失败");
			this.handleFailure(code ? `${code}: ${detail}` : detail);
		}
	}

	async start(config?: {
		websocketPath?: string;
		asrDefaults?: VoiceAsrDefaultsInput;
	}): Promise<void> {
		if (this.destroyed) {
			throw new Error("ASR 调试会话已销毁");
		}
		if (this.socket || this.captureState.captureStarted) {
			return;
		}

		const accessToken = String(this.options.getAccessToken() || "").trim();
		if (!accessToken) {
			throw new Error("voice access_token is required");
		}

		const websocketPath =
			String(config?.websocketPath || this.options.getVoiceWsPath() || "").trim() ||
			"/api/voice/ws";
		const asrDefaults = mergeVoiceAsrDefaults(
			config?.asrDefaults || this.options.getAsrDefaults(),
		);
		const target = describeVoiceChatWsTarget(websocketPath);
		const url = resolveVoiceChatWsUrl(websocketPath, accessToken);
		const taskId =
			this.options.taskIdFactory?.() ||
			`settings_asr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

		this.currentTaskId = taskId;
		this.currentAsrDefaults = asrDefaults;
		this.chunkCounter = 0;
		this.stopping = false;
		this.appendDebug(`connect ${target}`);
		this.emitState({
			status: "connecting",
			error: "",
			interimText: "",
			recording: false,
		});

		const WebSocketCtor = this.getWebSocketCtor();
		const socket = new WebSocketCtor(url);
		socket.binaryType = "arraybuffer";
		this.socket = socket;

		await new Promise<void>((resolve, reject) => {
			socket.onopen = () => {
				try {
					this.appendDebug("socket open");
					this.emitState({
						status: "socket-open",
						error: "",
						recording: false,
					});
					this.sendJson(buildVoiceAsrStartPayload(taskId, asrDefaults));
					this.appendDebug("sent asr.start");
					resolve();
				} catch (error) {
					reject(error as Error);
				}
			};
			socket.onmessage = (event) => {
				this.handleSocketMessage(event.data);
			};
			socket.onerror = () => {
				reject(new Error("ASR 调试 WebSocket 连接失败"));
			};
			socket.onclose = () => {
				if (this.destroyed) return;
				if (this.stopping) return;
				if (this.socket === socket) {
					this.socket = null;
				}
				if (this.captureState.captureStarted) {
					this.handleFailure("ASR 调试 WebSocket 已关闭");
				}
			};
		}).catch((error) => {
			this.cleanupTransport();
			throw error;
		});
	}

	stopAndCommit(): void {
		if (!this.socket || !this.currentTaskId) return;
		this.stopping = true;
		(
			this.options.audioCaptureFlush || flushVoiceAudioCaptureRemainder
		)(this.captureState, this.sendAudioChunk);
		(
			this.options.audioCaptureCleanup || cleanupVoiceAudioCapture
		)(this.captureState);
		for (const frame of buildVoiceAsrStopFrames(
			this.currentTaskId,
			new Uint8Array(0),
		)) {
			this.sendJson(frame);
			if (frame.type === "asr.audio.commit" || frame.type === "asr.stop") {
				this.appendDebug(`sent ${String(frame.type)}`);
			}
		}
		this.emitState({
			status: "stopping",
			error: "",
			recording: false,
		});
		this.scheduleStopFallback();
	}

	clearTranscript(): void {
		this.finalText = "";
		this.emitState({
			interimText: "",
			finalText: "",
			error: "",
		});
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.cleanupTransport();
	}
}
