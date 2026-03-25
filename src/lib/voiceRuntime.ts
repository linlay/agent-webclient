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
	describeVoiceChatWsTarget,
	resolveVoiceChatWsUrl,
} from "./voiceChatAudio";
import { computeVoiceChatTextDelta } from "./voiceChatTts";
import {
	closeSocket,
	ensureSocket,
	sendJsonFrame,
	type VoiceSocketContext,
} from "./voiceSocket";

const DEFAULT_VOICE_WS_PATH = "/api/voice/ws";

export const DEFAULT_TTS_DEBUG_TEXT =
	"这是一条 TTS 调试语音。如果你能听到这句话，说明当前语音播放链路正常。";

interface VoiceTaskStartOptions {
	voice?: string;
	speechRate?: number;
	inputMode?: "single" | "stream";
}

interface VoiceSession {
	kind: "block";
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

interface VoiceChatSession {
	kind: "voiceChat";
	sessionId: string;
	sourceText: string;
	taskId: string;
	committed: boolean;
	voice?: string;
	speechRate?: number;
	resolveIdleWaiters: Array<() => void>;
	resolvingIdle: boolean;
	pendingTaskPromise?: Promise<{ taskId: string; started: boolean }>;
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
	onVoiceChatError?: (message: string) => void;
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
	private voiceChatSessions = new Map<string, VoiceChatSession>();
	private voiceChatSessionIdByTaskId = new Map<string, string>();
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
	private muted = false;
	private debugTtsRequest: DebugTtsRequestState | null = null;
	private options: RuntimeOptions;

	constructor(options: RuntimeOptions) {
		this.options = options;
		this.muted = Boolean(options.getState().audioMuted);
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
		return resolveVoiceChatWsUrl(this.getVoiceWsPath(), accessToken);
	}

	private describeVoiceWsTarget(accessToken: string): string {
		void accessToken;
		return describeVoiceChatWsTarget(this.getVoiceWsPath());
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

	private waitForPlaybackIdle(): Promise<void> {
		const context = this.audioContext;
		if (!context || this.playbackCursor <= 0) {
			return Promise.resolve();
		}
		const remainingMs = Math.max(
			0,
			(this.playbackCursor - context.currentTime) * 1000,
		);
		if (remainingMs <= 0) {
			return Promise.resolve();
		}
		return new Promise((resolve) => {
			const timerApi = globalThis.window?.setTimeout || setTimeout;
			timerApi(resolve, remainingMs);
		});
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

	private getVoiceChatSessionByTaskId(taskId: string): VoiceChatSession | null {
		const sessionId = this.voiceChatSessionIdByTaskId.get(
			String(taskId || "").trim(),
		);
		if (!sessionId) return null;
		return this.voiceChatSessions.get(sessionId) || null;
	}

	private isCurrentDebugTask(taskId: string): boolean {
		return this.debugTtsRequest?.taskId === String(taskId || "").trim();
	}

	private isPlayableTask(taskId: string): boolean {
		return Boolean(
			this.getCurrentSessionByTaskId(taskId) ||
				this.getVoiceChatSessionByTaskId(taskId) ||
				this.isCurrentDebugTask(taskId),
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

	private maybeResolveVoiceChatSession(session: VoiceChatSession): void {
		if (!session.committed || session.taskId || session.resolvingIdle) {
			return;
		}
		session.resolvingIdle = true;
		void this.waitForPlaybackIdle().then(() => {
			session.resolvingIdle = false;
			if (!session.committed || session.taskId) {
				return;
			}
			const waiters = session.resolveIdleWaiters.splice(0);
			for (const resolve of waiters) {
				resolve();
			}
		});
	}

	private clearVoiceChatTask(taskId: string): void {
		const session = this.getVoiceChatSessionByTaskId(taskId);
		if (!session) return;
		this.voiceChatSessionIdByTaskId.delete(taskId);
		this.taskAudioFormatById.delete(taskId);
		if (session.taskId === taskId) {
			session.taskId = "";
		}
		this.maybeResolveVoiceChatSession(session);
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
		this.clearVoiceChatTask(taskId);
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
		if (this.getVoiceChatSessionByTaskId(taskId)) {
			this.clearVoiceChatTask(taskId);
			this.options.onVoiceChatError?.(message);
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
		for (const session of this.voiceChatSessions.values()) {
			if (session.taskId) {
				this.voiceChatSessionIdByTaskId.delete(session.taskId);
				this.taskAudioFormatById.delete(session.taskId);
				session.taskId = "";
			}
			this.maybeResolveVoiceChatSession(session);
		}
		if (this.voiceChatSessions.size > 0) {
			this.options.onVoiceChatError?.(errorMessage);
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
			kind: "block",
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

	private ensureVoiceChatSession(
		sessionId: string,
		options: VoiceTaskStartOptions = {},
	): VoiceChatSession {
		const normalizedSessionId = String(sessionId || "").trim();
		const existing = this.voiceChatSessions.get(normalizedSessionId);
		if (existing) {
			if (options.voice) existing.voice = options.voice;
			if (options.speechRate != null) existing.speechRate = options.speechRate;
			return existing;
		}

		const created: VoiceChatSession = {
			kind: "voiceChat",
			sessionId: normalizedSessionId,
			sourceText: "",
			taskId: "",
			committed: false,
			voice: options.voice,
			speechRate: options.speechRate,
			resolveIdleWaiters: [],
			resolvingIdle: false,
		};
		this.voiceChatSessions.set(normalizedSessionId, created);
		return created;
	}

	private startTask(
		taskId: string,
		text: string | undefined,
		options: VoiceTaskStartOptions = {},
	): void {
		this.sendJsonFrame({
			type: "tts.start",
			taskId,
			mode: "local",
			text: text || undefined,
			inputMode: options.inputMode || "single",
			chatId: this.options.getState().chatId || undefined,
			voice: options.voice || undefined,
			speechRate:
				options.speechRate != null ? Number(options.speechRate) : undefined,
		});
	}

	private appendTask(taskId: string, text: string): void {
		if (!taskId || !text) return;
		this.sendJsonFrame({
			type: "tts.append",
			taskId,
			text,
		});
	}

	private commitTask(taskId: string): void {
		if (!taskId) return;
		this.sendJsonFrame({
			type: "tts.commit",
			taskId,
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

	private async ensureVoiceChatTask(
		session: VoiceChatSession,
	): Promise<{ taskId: string; started: boolean }> {
		if (session.taskId) {
			return {
				taskId: session.taskId,
				started: false,
			};
		}
		if (session.pendingTaskPromise) {
			return session.pendingTaskPromise;
		}
		const promise = (async () => {
			await this.prepareAudioPlayback();
			await this.ensureSocket();
			const taskId = this.createTaskId("voice_chat");
			session.taskId = taskId;
			session.pendingTaskPromise = undefined;
			this.voiceChatSessionIdByTaskId.set(taskId, session.sessionId);
			this.startTask(taskId, undefined, {
				voice: session.voice,
				speechRate: session.speechRate,
				inputMode: "stream",
			});
			return {
				taskId,
				started: true,
			};
		})();
		session.pendingTaskPromise = promise;
		return promise;
	}

	async replayTtsVoiceBlock(
		contentId: string,
		signature: string,
		rawText: string,
	): Promise<void> {
		const normalizedContentId = String(contentId || "").trim();
		const normalizedSignature = String(signature || "").trim();
		const text = String(rawText || "");
		if (!normalizedContentId || !normalizedSignature || !text.trim()) {
			return;
		}

		const session = this.ensureSession(
			normalizedContentId,
			normalizedSignature,
		);
		session.closed = true;
		this.updateBlock(normalizedContentId, normalizedSignature, {
			signature: normalizedSignature,
			text,
			closed: true,
			status: "connecting",
			error: "",
		});

		try {
			await this.prepareAudioPlayback();
			await this.ensureSocket();
		} catch (error) {
			const message = (error as Error).message;
			this.updateBlock(normalizedContentId, normalizedSignature, {
				status: "error",
				error: message,
			});
			throw error;
		}

		this.restartSessionWithText(session, text);
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

	async syncVoiceChatSession(
		sessionId: string,
		fullText: string,
		options: VoiceTaskStartOptions = {},
	): Promise<{ started: boolean; appended: boolean; taskId: string }> {
		const normalizedSessionId = String(sessionId || "").trim();
		if (!normalizedSessionId) {
			return { started: false, appended: false, taskId: "" };
		}

		const session = this.ensureVoiceChatSession(normalizedSessionId, options);
		const nextText = String(fullText || "");
		const delta = computeVoiceChatTextDelta(session.sourceText, nextText);
		session.sourceText = nextText;
		session.committed = false;
		if (!delta) {
			return {
				started: false,
				appended: false,
				taskId: session.taskId,
			};
		}

		const { taskId, started } = await this.ensureVoiceChatTask(session);
		this.appendTask(taskId, delta);
		return {
			started,
			appended: true,
			taskId,
		};
	}

	async commitVoiceChatSession(sessionId: string): Promise<void> {
		const normalizedSessionId = String(sessionId || "").trim();
		if (!normalizedSessionId) return;

		const session = this.voiceChatSessions.get(normalizedSessionId);
		if (!session) return;

		session.committed = true;
		if (!session.taskId) {
			await this.waitForPlaybackIdle();
			this.voiceChatSessions.delete(normalizedSessionId);
			return;
		}

		this.commitTask(session.taskId);

		await new Promise<void>((resolve) => {
			session.resolveIdleWaiters.push(resolve);
			this.maybeResolveVoiceChatSession(session);
		});
		this.voiceChatSessions.delete(normalizedSessionId);
	}

	stopVoiceChatSession(sessionId: string): void {
		const normalizedSessionId = String(sessionId || "").trim();
		if (!normalizedSessionId) return;
		const session = this.voiceChatSessions.get(normalizedSessionId);
		if (!session) return;

		if (session.taskId) {
			this.stopTask(session.taskId);
			this.voiceChatSessionIdByTaskId.delete(session.taskId);
			this.taskAudioFormatById.delete(session.taskId);
			session.taskId = "";
		}
		const waiters = session.resolveIdleWaiters.splice(0);
		for (const resolve of waiters) {
			resolve();
		}
		this.voiceChatSessions.delete(normalizedSessionId);
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
			for (const sessionId of Array.from(this.voiceChatSessions.keys())) {
				this.stopVoiceChatSession(sessionId);
			}
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
		this.voiceChatSessions.clear();
		this.voiceChatSessionIdByTaskId.clear();
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

	setMuted(muted: boolean): void {
		this.muted = Boolean(muted);
		if (this.muted) {
			this.resetPlayback();
		}
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
