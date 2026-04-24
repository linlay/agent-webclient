import type { AppState, TtsVoiceBlock } from "@/app/state/types";
import { getCurrentAccessToken } from "@/shared/api/apiClient";
import { parseContentSegments } from "@/features/timeline/lib/contentSegments";
import {
	DEFAULT_CHANNELS,
	DEFAULT_SAMPLE_RATE,
	playPcm,
	prepareAudioPlayback,
	resetPlayback,
	type VoiceAudioPlayerContext,
} from "@/features/voice/lib/voiceAudioPlayer";
import {
	describeVoiceChatWsTarget,
	resolveVoiceChatWsUrl,
} from "@/features/voice/lib/voiceChatAudio";
import { computeVoiceChatTextDelta } from "@/features/voice/lib/voiceChatTts";
import {
	closeSocket,
	ensureSocket,
	sendJsonFrame,
	type VoiceSocketContext,
} from "@/features/voice/lib/voiceSocket";
import {
	type DebugTtsRequestState,
	VoiceMessageHandler,
} from "@/features/voice/lib/voiceMessageHandler";
import {
	type VoiceChatSession,
	type VoiceSession,
	VoiceSessionManager,
	type VoiceTaskStartOptions,
} from "@/features/voice/lib/voiceSessionManager";
const DEFAULT_VOICE_WS_PATH = "/api/voice/ws";

export interface RuntimeOptions {
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

export class VoiceRuntimeCore {
	private sessions = new VoiceSessionManager();
	private messages: VoiceMessageHandler;
	private outboundQueue: string[] = [];
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

	constructor(private readonly options: RuntimeOptions) {
		this.muted = Boolean(options.getState().audioMuted);
		this.messages = new VoiceMessageHandler({
			sessions: this.sessions,
			getDebugTtsRequest: () => this.debugTtsRequest,
			appendDebug: (message) => this.appendDebug(message),
			setDebugStatus: (status) => this.setDebugStatus(status),
			setDebugStatusWithStats: (status) => this.setDebugStatusWithStats(status),
			waitForPlaybackIdle: () => this.waitForPlaybackIdle(),
			updateBlock: (contentId, signature, patch) =>
				this.updateBlock(contentId, signature, patch),
			playPcm: (bufferLike) => this.playPcm(bufferLike),
			setActiveAudioTask: (taskId, sampleRate, channels) => {
				this.activeAudioTaskId = taskId;
				this.activeSampleRate = sampleRate;
				this.activeChannels = channels;
			},
			onVoiceChatError: options.onVoiceChatError,
		});
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
		return getCurrentAccessToken() ||
			String(this.options.getState().accessToken || "").trim();
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
		const session = this.sessions.getCurrentBlockSessionByTaskId(taskId);
		if (!session) return;
		this.updateBlock(session.contentId, session.signature, patch);
	}

	private markUncommittedSessionsError(message: string): void {
		this.messages.markUncommittedSessionsError(message);
	}

	private handleSocketBinary(data: unknown): void {
		this.messages.handleSocketBinary(data);
	}

	private handleTaskStarted(
		taskId: string,
		payload: Record<string, unknown>,
	): void {
		this.messages.handleTaskStarted(taskId, payload);
	}

	private handleTaskAudioFormat(
		taskId: string,
		payload: Record<string, unknown>,
	): void {
		this.messages.handleTaskAudioFormat(taskId, payload);
	}

	private handleTaskAudioChunk(
		taskId: string,
		payload: Record<string, unknown>,
	): void {
		this.messages.handleTaskAudioChunk(taskId, payload);
	}

	private handleTaskDone(
		taskId: string,
		payload: Record<string, unknown>,
	): void {
		this.messages.handleTaskDone(taskId, payload);
	}

	private handleTaskStopped(
		taskId: string,
		payload: Record<string, unknown>,
	): void {
		this.messages.handleTaskStopped(taskId, payload);
	}

	private handleTaskError(
		taskId: string,
		message: string,
		code: string,
		payload: Record<string, unknown>,
	): void {
		this.messages.handleTaskError(taskId, message, code, payload);
	}

	private ensureSocket(): Promise<WebSocket> {
		return ensureSocket(this as unknown as VoiceSocketContext);
	}

	private sendJsonFrame(payload: Record<string, unknown>): void {
		sendJsonFrame(this as unknown as VoiceSocketContext, payload);
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
		}

		const nextTaskId = this.sessions.createTaskId("tts");
		this.sessions.bindBlockTask(session, nextTaskId, nextText);
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
			const taskId = this.sessions.createTaskId("voice_chat");
			this.sessions.bindVoiceChatTask(session, taskId);
			session.pendingTaskPromise = undefined;
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

		const session = this.sessions.ensureBlockSession(
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
		this.sessions.removeBlockSession(session);
	}

	private stopDebugTask(): void {
		if (!this.debugTtsRequest?.taskId) return;
		this.stopTask(this.debugTtsRequest.taskId);
		this.sessions.clearTaskAudioFormat(this.debugTtsRequest.taskId);
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

			const session = this.sessions.ensureBlockSession(
				contentId,
				segment.signature,
			);
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

		for (const session of Array.from(this.sessions.blockSessions)) {
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

		const session = this.sessions.ensureVoiceChatSession(
			normalizedSessionId,
			options,
		);
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

		const session = this.sessions.getVoiceChatSession(normalizedSessionId);
		if (!session) return;

		session.committed = true;
		if (!session.taskId) {
			await this.waitForPlaybackIdle();
			this.sessions.deleteVoiceChatSession(normalizedSessionId);
			return;
		}

		this.commitTask(session.taskId);

		await new Promise<void>((resolve) => {
			session.resolveIdleWaiters.push(resolve);
			this.messages.maybeResolveVoiceChatSession(session);
		});
		this.sessions.deleteVoiceChatSession(normalizedSessionId);
	}

	stopVoiceChatSession(sessionId: string): void {
		const normalizedSessionId = String(sessionId || "").trim();
		if (!normalizedSessionId) return;
		const session = this.sessions.getVoiceChatSession(normalizedSessionId);
		if (!session) return;

		if (session.taskId) {
			this.stopTask(session.taskId);
			this.sessions.clearVoiceChatTask(session.taskId);
		}
		const waiters = session.resolveIdleWaiters.splice(0);
		for (const resolve of waiters) {
			resolve();
		}
		this.sessions.deleteVoiceChatSession(normalizedSessionId);
	}

	stopAllVoiceSessions(
		reason = "manual",
		options: { mode?: "commit" | "stop" } = {},
	): void {
		const shouldStop =
			options.mode === "stop" ||
			String(reason || "").toLowerCase().includes("stop");

		for (const session of this.sessions.blockSessions) {
			if (shouldStop && session.taskId) {
				this.stopTask(session.taskId);
			}
			if (session.taskId) {
				this.sessions.clearBlockTask(session.taskId);
			}
			if (shouldStop) {
				this.updateBlock(session.contentId, session.signature, {
					status: "stopped",
					error: "",
				});
			}
		}

		if (shouldStop) {
			for (const session of Array.from(this.sessions.voiceChatSessionValues)) {
				this.stopVoiceChatSession(session.sessionId);
			}
			this.stopDebugTask();
			this.resetPlayback();
			this.messages.clearPendingAudio();
			this.activeAudioTaskId = "";
			this.setDebugStatus("stopped");
		}
	}

	resetVoiceRuntime(): void {
		this.stopAllVoiceSessions("reset", { mode: "stop" });
		this.sessions.reset();
		this.outboundQueue.length = 0;
		this.messages.clearPendingAudio();
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
		const taskId = this.sessions.createTaskId("debug");
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
