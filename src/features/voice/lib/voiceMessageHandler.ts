import type { TtsVoiceBlock } from "@/app/state/types";
import {
	DEFAULT_CHANNELS,
	DEFAULT_SAMPLE_RATE,
	isArrayBufferView,
} from "@/features/voice/lib/voiceAudioPlayer";
import type {
	VoiceChatSession,
	VoiceSessionManager,
} from "@/features/voice/lib/voiceSessionManager";

export interface DebugTtsRequestState {
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

interface VoiceMessageHandlerOptions {
	sessions: VoiceSessionManager;
	getDebugTtsRequest: () => DebugTtsRequestState | null;
	appendDebug: (message: string) => void;
	setDebugStatus: (status: string) => void;
	setDebugStatusWithStats: (status: string) => void;
	waitForPlaybackIdle: () => Promise<void>;
	updateBlock: (
		contentId: string,
		signature: string,
		patch: Partial<TtsVoiceBlock>,
	) => void;
	playPcm: (bufferLike: ArrayBuffer | ArrayBufferView) => boolean;
	setActiveAudioTask: (
		taskId: string,
		sampleRate: number,
		channels: number,
	) => void;
	onVoiceChatError?: (message: string) => void;
}

export class VoiceMessageHandler {
	private pendingAudioChunks: PendingAudioChunk[] = [];

	constructor(private readonly options: VoiceMessageHandlerOptions) {}

	clearPendingAudio(): void {
		this.pendingAudioChunks.length = 0;
	}

	isCurrentDebugTask(taskId: string): boolean {
		return this.options.getDebugTtsRequest()?.taskId === String(taskId || "").trim();
	}

	isPlayableTask(taskId: string): boolean {
		return Boolean(
			this.options.sessions.getCurrentBlockSessionByTaskId(taskId) ||
				this.options.sessions.getVoiceChatSessionByTaskId(taskId) ||
				this.isCurrentDebugTask(taskId),
		);
	}

	handleSocketBinary(data: unknown): void {
		if (typeof Blob !== "undefined" && data instanceof Blob) {
			data
				.arrayBuffer()
				.then((buffer) => this.handleBinaryPayload(buffer))
				.catch((error) =>
					this.options.appendDebug(
						`voice blob decode failed: ${(error as Error).message}`,
					),
				);
			return;
		}
		if (data instanceof ArrayBuffer || isArrayBufferView(data)) {
			this.handleBinaryPayload(data);
		}
	}

	handleTaskStarted(
		taskId: string,
		_payload: Record<string, unknown>,
	): void {
		const session = this.options.sessions.getCurrentBlockSessionByTaskId(taskId);
		if (session) {
			this.options.updateBlock(session.contentId, session.signature, {
				status: "playing",
				error: "",
			});
		}
		const debugTtsRequest = this.options.getDebugTtsRequest();
		if (this.isCurrentDebugTask(taskId) && debugTtsRequest) {
			debugTtsRequest.started = true;
			this.options.setDebugStatusWithStats("tts started");
		}
	}

	handleTaskAudioFormat(
		taskId: string,
		payload: Record<string, unknown>,
	): void {
		const sampleRate = Number(payload.sampleRate) || DEFAULT_SAMPLE_RATE;
		const channels = Number(payload.channels) || DEFAULT_CHANNELS;
		this.options.sessions.setTaskAudioFormat(taskId, { sampleRate, channels });

		const session = this.options.sessions.getCurrentBlockSessionByTaskId(taskId);
		if (session) {
			session.sampleRate = sampleRate;
			session.channels = channels;
			this.options.updateBlock(session.contentId, session.signature, {
				sampleRate,
				channels,
			});
		}
	}

	handleTaskAudioChunk(
		taskId: string,
		payload: Record<string, unknown>,
	): void {
		this.pendingAudioChunks.push({
			taskId,
			byteLength: Math.max(0, Number(payload.byteLength) || 0),
		});
		const session = this.options.sessions.getCurrentBlockSessionByTaskId(taskId);
		if (session) {
			this.options.updateBlock(session.contentId, session.signature, {
				status: "playing",
				error: "",
			});
		}
	}

	handleTaskDone(
		taskId: string,
		_payload: Record<string, unknown>,
	): void {
		const session = this.options.sessions.getCurrentBlockSessionByTaskId(taskId);
		if (session) {
			session.completed = true;
			this.options.updateBlock(session.contentId, session.signature, {
				status: "done",
				error: "",
			});
		}
		const debugTtsRequest = this.options.getDebugTtsRequest();
		if (this.isCurrentDebugTask(taskId) && debugTtsRequest) {
			debugTtsRequest.completed = true;
			if (debugTtsRequest.audioFrames > 0) {
				this.options.setDebugStatusWithStats("done");
			} else if (debugTtsRequest.started) {
				this.options.setDebugStatus("connected but no audio frames");
			} else {
				this.options.setDebugStatus("done");
			}
		}
	}

	handleTaskStopped(
		taskId: string,
		payload: Record<string, unknown>,
	): void {
		const reason = String(payload.reason || "").trim();
		const session = this.options.sessions.clearBlockTask(taskId);
		if (session) {
			session.completed =
				session.completed ||
				reason === "completed" ||
				reason === "no_content";
			if (reason === "client_stop" || reason === "connection_closed") {
				this.options.updateBlock(session.contentId, session.signature, {
					status: "stopped",
					error: "",
				});
			} else if (!session.completed) {
				this.options.updateBlock(session.contentId, session.signature, {
					status: "stopped",
					error: "",
				});
			}
		}
		this.clearVoiceChatTask(taskId);
		const debugTtsRequest = this.options.getDebugTtsRequest();
		if (this.isCurrentDebugTask(taskId) && debugTtsRequest) {
			const shouldStayDone =
				debugTtsRequest.completed &&
				reason !== "client_stop" &&
				reason !== "connection_closed";
			if (!shouldStayDone) {
				this.options.setDebugStatus("stopped");
			}
		}
	}

	handleTaskError(
		taskId: string,
		message: string,
		_code: string,
		_payload: Record<string, unknown>,
	): void {
		const session = this.options.sessions.getCurrentBlockSessionByTaskId(taskId);
		if (session) {
			this.options.updateBlock(session.contentId, session.signature, {
				status: "error",
				error: message,
			});
		}
		if (this.options.sessions.getVoiceChatSessionByTaskId(taskId)) {
			this.clearVoiceChatTask(taskId);
			this.options.onVoiceChatError?.(message);
		}
		if (this.isCurrentDebugTask(taskId)) {
			this.options.setDebugStatus(`error: ${message}`);
			return;
		}
		if (!taskId) {
			this.markUncommittedSessionsError(message);
			this.options.setDebugStatus(`error: ${message}`);
		}
	}

	markUncommittedSessionsError(message: string): void {
		const errorMessage = String(message || "voice websocket closed");
		for (const session of this.options.sessions.blockSessions) {
			if (!session.taskId) continue;
			this.options.updateBlock(session.contentId, session.signature, {
				status: "error",
				error: errorMessage,
			});
		}
		for (const session of this.options.sessions.voiceChatSessionValues) {
			if (session.taskId) {
				this.options.sessions.clearVoiceChatTask(session.taskId);
			}
			this.maybeResolveVoiceChatSession(session);
		}
		if (this.options.sessions.voiceChatSessionCount > 0) {
			this.options.onVoiceChatError?.(errorMessage);
		}
		if (this.options.getDebugTtsRequest()?.taskId) {
			this.options.setDebugStatus(`error: ${errorMessage}`);
		}
	}

	maybeResolveVoiceChatSession(session: VoiceChatSession): void {
		if (!session.committed || session.taskId || session.resolvingIdle) {
			return;
		}
		session.resolvingIdle = true;
		void this.options.waitForPlaybackIdle().then(() => {
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

	clearVoiceChatTask(taskId: string): void {
		const session = this.options.sessions.clearVoiceChatTask(taskId);
		if (!session) return;
		this.maybeResolveVoiceChatSession(session);
	}

	private handleBinaryPayload(bufferLike: ArrayBuffer | ArrayBufferView): void {
		const pending = this.pendingAudioChunks.shift();
		if (!pending) {
			this.options.appendDebug("voice ws binary frame without tts.audio.chunk");
			return;
		}
		if (!this.isPlayableTask(pending.taskId)) return;

		const format = this.options.sessions.getTaskAudioFormat(pending.taskId);
		this.options.setActiveAudioTask(
			pending.taskId,
			format.sampleRate,
			format.channels,
		);
		this.handleAudioBytes(
			pending.taskId,
			bufferLike instanceof ArrayBuffer
				? bufferLike.byteLength
				: bufferLike.byteLength,
		);
		this.options.playPcm(bufferLike);
	}

	private handleAudioBytes(taskId: string, byteLength: number): void {
		const debugTtsRequest = this.options.getDebugTtsRequest();
		if (!debugTtsRequest || debugTtsRequest.taskId !== String(taskId || "").trim()) {
			return;
		}
		debugTtsRequest.audioFrames += 1;
		debugTtsRequest.audioBytes += Math.max(0, Number(byteLength) || 0);
		this.options.setDebugStatusWithStats("receiving audio");
	}
}
