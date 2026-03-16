import type { AppState, TtsVoiceBlock } from "../context/types";
import { parseContentSegments } from "./contentSegments";
import {
	DEFAULT_CHANNELS,
	DEFAULT_SAMPLE_RATE,
	isArrayBufferView,
	playPcm,
	prepareAudioPlayback,
	resetPlayback,
	type VoiceAudioPlayerContext,
} from "./voiceAudioPlayer";
import {
	closeSocket,
	ensureSocket,
	sendJsonFrame,
	type VoiceSocketContext,
} from "./voiceSocket";

const DEFAULT_VOICE_WS_PATH = "/api/voice/ws";

export const DEFAULT_TTS_DEBUG_TEXT =
	"这是一条 TTS 调试语音。如果你能听到这句话，说明当前语音播放链路正常。";

interface VoiceSession {
	key: string;
	contentId: string;
	signature: string;
	taskId: string;
	text: string;
	closed: boolean;
	completed: boolean;
	sampleRate?: number;
	channels?: number;
}

interface RuntimeOptions {
	getState: () => AppState;
	onPatchBlock: (
		contentId: string,
		signature: string,
		patch: Partial<TtsVoiceBlock>,
	) => void;
	onRemoveInactiveBlocks: (
		contentId: string,
		activeSignatures: Set<string>,
	) => void;
	onDebug?: (line: string) => void;
	onDebugStatus?: (status: string) => void;
}

interface DebugTtsRequestState {
	taskId: string;
	audioFrames: number;
	audioBytes: number;
	started: boolean;
	completed: boolean;
}

interface PendingAudioChunk {
	taskId: string;
	byteLength: number;
}

class VoiceRuntime {
	private sessionsByKey = new Map<string, VoiceSession>();
	private sessionKeyByTaskId = new Map<string, string>();
	private outboundQueue: string[] = [];
	private pendingAudioChunks: PendingAudioChunk[] = [];
	private taskAudioFormatById = new Map<
		string,
		{ sampleRate: number; channels: number }
	>();
	private socket: WebSocket | null = null;
	private socketConnectingPromise: Promise<WebSocket> | null = null;
	private socketClosingExpected = false;
	private audioContext: AudioContext | null = null;
	private playbackCursor = 0;
	private activeAudioTaskId = "";
	private activeSampleRate = DEFAULT_SAMPLE_RATE;
	private activeChannels = DEFAULT_CHANNELS;
	private debugTtsRequest: DebugTtsRequestState | null = null;
	private options: RuntimeOptions;

	constructor(options: RuntimeOptions) {
		this.options = options;
	}

	private appendDebug(message: string): void {
		this.options.onDebug?.(message);
	}

	private setDebugStatus(status: string): void {
		this.options.onDebugStatus?.(String(status || "").trim() || "idle");
	}

	private setDebugStatusWithStats(status: string): void {
		const stats = this.debugTtsRequest;
		if (!stats || !stats.taskId) {
			this.setDebugStatus(status);
			return;
		}
		const suffix =
			stats.audioFrames > 0
				? ` (${stats.audioFrames} frames, ${stats.audioBytes} bytes)`
				: "";
		this.setDebugStatus(`${status}${suffix}`);
	}

	private getAccessToken(): string {
		return String(this.options.getState().accessToken || "").trim();
	}

	private getVoiceWsPath(): string {
		const rawPath = String(
			this.options.getState().voiceChat.capabilities?.websocketPath || "",
		).trim();
		return rawPath || DEFAULT_VOICE_WS_PATH;
	}

	private getVoiceWsUrl(accessToken: string): string {
		const location = globalThis.window?.location;
		const base =
			!location || !location.host
				? "ws://localhost"
				: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
		const url = new URL(this.getVoiceWsPath(), base);
		url.searchParams.set("access_token", accessToken);
		return url.toString();
	}

	private describeVoiceWsTarget(accessToken: string): string {
		const url = new URL(this.getVoiceWsUrl(accessToken));
		url.search = "";
		return `${url.origin}${url.pathname}`;
	}

	private sessionKeyOf(contentId: string, signature: string): string {
		return `${contentId}::${signature}`;
	}

	private createTaskId(prefix = "tts"): string {
		return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	}

	private async prepareAudioPlayback(): Promise<AudioContext> {
		return prepareAudioPlayback(this as unknown as VoiceAudioPlayerContext);
	}

	private resetPlayback(): void {
		resetPlayback(this as unknown as VoiceAudioPlayerContext);
	}

	private playPcm(bufferLike: ArrayBuffer | ArrayBufferView): boolean {
		return playPcm(this as unknown as VoiceAudioPlayerContext, bufferLike);
	}

	private updateBlock(
		contentId: string,
		signature: string,
		patch: Partial<TtsVoiceBlock>,
	): void {
		this.options.onPatchBlock(contentId, signature, patch);
	}

	private updateBlockByTaskId(
		taskId: string,
		patch: Partial<TtsVoiceBlock>,
	): void {
		const session = this.getCurrentSessionByTaskId(taskId);
		if (!session) return;
		this.updateBlock(session.contentId, session.signature, patch);
	}

	private getSessionByTaskId(taskId: string): VoiceSession | null {
		const key = this.sessionKeyByTaskId.get(String(taskId || "").trim());
		if (!key) return null;
		return this.sessionsByKey.get(key) || null;
	}

	private getCurrentSessionByTaskId(taskId: string): VoiceSession | null {
		const session = this.getSessionByTaskId(taskId);
		if (!session || session.taskId !== taskId) return null;
		return session;
	}

	private isCurrentDebugTask(taskId: string): boolean {
		return this.debugTtsRequest?.taskId === String(taskId || "").trim();
	}

	private isPlayableTask(taskId: string): boolean {
		return Boolean(
			this.getCurrentSessionByTaskId(taskId) || this.isCurrentDebugTask(taskId),
		);
	}

	private getTaskAudioFormat(taskId: string): {
		sampleRate: number;
		channels: number;
	} {
		const saved = this.taskAudioFormatById.get(taskId);
		if (saved) return saved;
		return {
			sampleRate: DEFAULT_SAMPLE_RATE,
			channels: DEFAULT_CHANNELS,
		};
	}

	private trackTaskAudioFormat(
		taskId: string,
		payload: Record<string, unknown>,
	): void {
		const sampleRate = Number(payload.sampleRate) || DEFAULT_SAMPLE_RATE;
		const channels = Number(payload.channels) || DEFAULT_CHANNELS;
		this.taskAudioFormatById.set(taskId, { sampleRate, channels });

		const session = this.getCurrentSessionByTaskId(taskId);
		if (session) {
			session.sampleRate = sampleRate;
			session.channels = channels;
			this.updateBlock(session.contentId, session.signature, {
				sampleRate,
				channels,
			});
		}
	}

	private handleAudioBytes(byteLength: number): void {
		if (
			!this.activeAudioTaskId ||
			!this.debugTtsRequest ||
			this.debugTtsRequest.taskId !== this.activeAudioTaskId
		) {
			return;
		}
		this.debugTtsRequest.audioFrames += 1;
		this.debugTtsRequest.audioBytes += Math.max(0, Number(byteLength) || 0);
		this.setDebugStatusWithStats("receiving audio");
	}

	private handleBinaryPayload(bufferLike: ArrayBuffer | ArrayBufferView): void {
		const pending = this.pendingAudioChunks.shift();
		if (!pending) {
			this.appendDebug("voice ws binary frame without tts.audio.chunk");
			return;
		}
		if (!this.isPlayableTask(pending.taskId)) return;

		const format = this.getTaskAudioFormat(pending.taskId);
		this.activeAudioTaskId = pending.taskId;
		this.activeSampleRate = format.sampleRate;
		this.activeChannels = format.channels;
		this.handleAudioBytes(
			bufferLike instanceof ArrayBuffer
				? bufferLike.byteLength
				: bufferLike.byteLength,
		);
		this.playPcm(bufferLike);
	}

	private handleSocketBinary(data: unknown): void {
		if (typeof Blob !== "undefined" && data instanceof Blob) {
			data
				.arrayBuffer()
				.then((buffer) => this.handleBinaryPayload(buffer))
				.catch((error) =>
					this.appendDebug(
						`voice blob decode failed: ${(error as Error).message}`,
					),
				);
			return;
		}
		if (data instanceof ArrayBuffer || isArrayBufferView(data)) {
			this.handleBinaryPayload(data);
		}
	}

	private handleTaskStarted(
		taskId: string,
		_payload: Record<string, unknown>,
	): void {
		const session = this.getCurrentSessionByTaskId(taskId);
		if (session) {
			this.updateBlock(session.contentId, session.signature, {
				status: "playing",
				error: "",
			});
		}
		if (this.isCurrentDebugTask(taskId) && this.debugTtsRequest) {
			this.debugTtsRequest.started = true;
			this.setDebugStatusWithStats("tts started");
		}
	}

	private handleTaskAudioFormat(
		taskId: string,
		payload: Record<string, unknown>,
	): void {
		this.trackTaskAudioFormat(taskId, payload);
	}

	private handleTaskAudioChunk(
		taskId: string,
		payload: Record<string, unknown>,
	): void {
		this.pendingAudioChunks.push({
			taskId,
			byteLength: Math.max(0, Number(payload.byteLength) || 0),
		});
		const session = this.getCurrentSessionByTaskId(taskId);
		if (session) {
			this.updateBlock(session.contentId, session.signature, {
				status: "playing",
				error: "",
			});
		}
	}

	private handleTaskDone(
		taskId: string,
		_payload: Record<string, unknown>,
	): void {
		const session = this.getCurrentSessionByTaskId(taskId);
		if (session) {
			session.completed = true;
			this.updateBlock(session.contentId, session.signature, {
				status: "done",
				error: "",
			});
		}
		if (this.isCurrentDebugTask(taskId) && this.debugTtsRequest) {
			this.debugTtsRequest.completed = true;
			if (this.debugTtsRequest.audioFrames > 0) {
				this.setDebugStatusWithStats("done");
			} else if (this.debugTtsRequest.started) {
				this.setDebugStatus("connected but no audio frames");
			} else {
				this.setDebugStatus("done");
			}
		}
	}

	private handleTaskStopped(
		taskId: string,
		payload: Record<string, unknown>,
	): void {
		const reason = String(payload.reason || "").trim();
		const session = this.getCurrentSessionByTaskId(taskId);
		if (session) {
			this.sessionKeyByTaskId.delete(taskId);
			this.taskAudioFormatById.delete(taskId);
			session.taskId = "";
			session.completed =
				session.completed ||
				reason === "completed" ||
				reason === "no_content";
			if (reason === "client_stop" || reason === "connection_closed") {
				this.updateBlock(session.contentId, session.signature, {
					status: "stopped",
					error: "",
				});
			} else if (!session.completed) {
				this.updateBlock(session.contentId, session.signature, {
					status: "stopped",
					error: "",
				});
			}
		}
		if (this.isCurrentDebugTask(taskId) && this.debugTtsRequest) {
			const shouldStayDone =
				this.debugTtsRequest.completed &&
				reason !== "client_stop" &&
				reason !== "connection_closed";
			if (!shouldStayDone) {
				this.setDebugStatus("stopped");
			}
		}
	}

	private handleTaskError(
		taskId: string,
		message: string,
		_code: string,
		_payload: Record<string, unknown>,
	): void {
		const session = this.getCurrentSessionByTaskId(taskId);
		if (session) {
			this.updateBlock(session.contentId, session.signature, {
				status: "error",
				error: message,
			});
		}
		if (this.isCurrentDebugTask(taskId)) {
			this.setDebugStatus(`error: ${message}`);
			return;
		}
		if (!taskId) {
			this.markUncommittedSessionsError(message);
			this.setDebugStatus(`error: ${message}`);
		}
	}

	private markUncommittedSessionsError(message: string): void {
		const errorMessage = String(message || "voice websocket closed");
		for (const session of this.sessionsByKey.values()) {
			if (!session.taskId) continue;
			this.updateBlock(session.contentId, session.signature, {
				status: "error",
				error: errorMessage,
			});
		}
		if (this.debugTtsRequest?.taskId) {
			this.setDebugStatus(`error: ${errorMessage}`);
		}
	}

	private ensureSocket(): Promise<WebSocket> {
		return ensureSocket(this as unknown as VoiceSocketContext);
	}

	private sendJsonFrame(payload: Record<string, unknown>): void {
		sendJsonFrame(this as unknown as VoiceSocketContext, payload);
	}

	private ensureSession(contentId: string, signature: string): VoiceSession {
		const key = this.sessionKeyOf(contentId, signature);
		const existing = this.sessionsByKey.get(key);
		if (existing) return existing;

		const created: VoiceSession = {
			key,
			contentId,
			signature,
			taskId: "",
			text: "",
			closed: false,
			completed: false,
		};
		this.sessionsByKey.set(key, created);
		return created;
	}

	private startTask(taskId: string, text: string): void {
		this.sendJsonFrame({
			type: "tts.start",
			taskId,
			mode: "local",
			text,
			chatId: this.options.getState().chatId || undefined,
		});
	}

	private stopTask(taskId: string): void {
		if (!taskId) return;
		this.sendJsonFrame({
			type: "tts.stop",
			taskId,
		});
	}

	private restartSessionWithText(session: VoiceSession, text: string): void {
		const nextText = String(text || "");
		const previousTaskId = session.taskId;
		if (previousTaskId) {
			this.stopTask(previousTaskId);
			this.sessionKeyByTaskId.delete(previousTaskId);
			this.taskAudioFormatById.delete(previousTaskId);
		}

		const nextTaskId = this.createTaskId("tts");
		session.taskId = nextTaskId;
		session.text = nextText;
		session.completed = false;
		session.sampleRate = undefined;
		session.channels = undefined;
		this.sessionKeyByTaskId.set(nextTaskId, session.key);
		this.startTask(nextTaskId, nextText);
		this.updateBlock(session.contentId, session.signature, {
			status: "connecting",
			error: "",
		});
	}

	private removeSession(session: VoiceSession, stopTask = false): void {
		if (stopTask && session.taskId) {
			this.stopTask(session.taskId);
		}
		if (session.taskId) {
			this.sessionKeyByTaskId.delete(session.taskId);
			this.taskAudioFormatById.delete(session.taskId);
		}
		this.sessionsByKey.delete(session.key);
	}

	private stopDebugTask(): void {
		if (!this.debugTtsRequest?.taskId) return;
		this.stopTask(this.debugTtsRequest.taskId);
		this.taskAudioFormatById.delete(this.debugTtsRequest.taskId);
	}

	processTtsVoiceBlocks(
		contentId: string,
		text: string,
		_status: string,
		source: "live" | "history" = "live",
	): void {
		const segments = parseContentSegments(contentId, text);
		const active = new Set<string>();

		for (const segment of segments) {
			if (segment.kind !== "ttsVoice" || !segment.signature) continue;
			active.add(segment.signature);

			const session = this.ensureSession(contentId, segment.signature);
			const nextText = String(segment.text || "");
			session.closed = Boolean(segment.closed);

			this.updateBlock(contentId, segment.signature, {
				signature: segment.signature,
				text: nextText,
				closed: session.closed,
			});

			if (source !== "live") continue;
			if (!nextText.trim()) continue;
			if (session.text === nextText && session.taskId) continue;
			this.restartSessionWithText(session, nextText);
		}

		for (const session of Array.from(this.sessionsByKey.values())) {
			if (session.contentId !== contentId) continue;
			if (active.has(session.signature)) continue;
			this.removeSession(session, true);
		}

		this.options.onRemoveInactiveBlocks(contentId, active);
	}

	stopAllVoiceSessions(
		reason = "manual",
		options: { mode?: "commit" | "stop" } = {},
	): void {
		const shouldStop =
			options.mode === "stop" ||
			String(reason || "").toLowerCase().includes("stop");

		for (const session of this.sessionsByKey.values()) {
			if (shouldStop && session.taskId) {
				this.stopTask(session.taskId);
			}
			if (session.taskId) {
				this.sessionKeyByTaskId.delete(session.taskId);
				this.taskAudioFormatById.delete(session.taskId);
				session.taskId = "";
			}
			if (shouldStop) {
				this.updateBlock(session.contentId, session.signature, {
					status: "stopped",
					error: "",
				});
			}
		}

		if (shouldStop) {
			this.stopDebugTask();
			this.resetPlayback();
			this.pendingAudioChunks.length = 0;
			this.activeAudioTaskId = "";
			this.setDebugStatus("stopped");
		}
	}

	resetVoiceRuntime(): void {
		this.stopAllVoiceSessions("reset", { mode: "stop" });
		this.sessionsByKey.clear();
		this.sessionKeyByTaskId.clear();
		this.taskAudioFormatById.clear();
		this.outboundQueue.length = 0;
		this.pendingAudioChunks.length = 0;
		this.debugTtsRequest = null;
		this.activeAudioTaskId = "";
		this.activeSampleRate = DEFAULT_SAMPLE_RATE;
		this.activeChannels = DEFAULT_CHANNELS;
		this.resetPlayback();
		this.closeSocket();
		this.setDebugStatus("idle");
	}

	async debugSpeakTtsVoice(rawText: string): Promise<string> {
		const text = String(rawText || "").trim();
		if (!text) throw new Error("debug text is empty");
		const accessToken = this.getAccessToken();
		if (!accessToken) {
			const errorMessage = "voice access_token is required";
			this.setDebugStatus(`error: ${errorMessage}`);
			throw new Error(errorMessage);
		}

		this.stopDebugTask();
		const taskId = this.createTaskId("debug");
		this.debugTtsRequest = {
			taskId,
			audioFrames: 0,
			audioBytes: 0,
			started: false,
			completed: false,
		};
		this.setDebugStatus("connecting");
		try {
			await this.prepareAudioPlayback();
		} catch (error) {
			const message = (error as Error).message;
			this.setDebugStatus(`error: ${message}`);
			throw error;
		}
		await this.ensureSocket();
		this.setDebugStatus("socket open");
		this.startTask(taskId, text);
		this.appendDebug(`voice debug sent: ${taskId}, chars=${text.length}`);
		return taskId;
	}

	private closeSocket(): void {
		closeSocket(this as unknown as VoiceSocketContext);
	}
}

let runtime: VoiceRuntime | null = null;

export function initVoiceRuntime(options: RuntimeOptions): VoiceRuntime {
	runtime = new VoiceRuntime(options);
	return runtime;
}

export function getVoiceRuntime(): VoiceRuntime | null {
	return runtime;
}
