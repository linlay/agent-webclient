import {
	DEFAULT_CHANNELS,
	DEFAULT_SAMPLE_RATE,
} from "@/features/voice/lib/voiceAudioPlayer";

export interface VoiceTaskStartOptions {
	voice?: string;
	speechRate?: number;
	inputMode?: "single" | "stream";
}

export interface VoiceSession {
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

export interface VoiceChatSession {
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

export interface VoiceTaskAudioFormat {
	sampleRate: number;
	channels: number;
}

export class VoiceSessionManager {
	private sessionsByKey = new Map<string, VoiceSession>();
	private sessionKeyByTaskId = new Map<string, string>();
	private voiceChatSessions = new Map<string, VoiceChatSession>();
	private voiceChatSessionIdByTaskId = new Map<string, string>();
	private taskAudioFormatById = new Map<string, VoiceTaskAudioFormat>();

	createTaskId(prefix = "tts"): string {
		return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	}

	sessionKeyOf(contentId: string, signature: string): string {
		return `${contentId}::${signature}`;
	}

	get blockSessions(): IterableIterator<VoiceSession> {
		return this.sessionsByKey.values();
	}

	get voiceChatSessionCount(): number {
		return this.voiceChatSessions.size;
	}

	get voiceChatSessionValues(): IterableIterator<VoiceChatSession> {
		return this.voiceChatSessions.values();
	}

	ensureBlockSession(contentId: string, signature: string): VoiceSession {
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

	ensureVoiceChatSession(
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

	getBlockSessionByTaskId(taskId: string): VoiceSession | null {
		const key = this.sessionKeyByTaskId.get(String(taskId || "").trim());
		if (!key) return null;
		return this.sessionsByKey.get(key) || null;
	}

	getCurrentBlockSessionByTaskId(taskId: string): VoiceSession | null {
		const session = this.getBlockSessionByTaskId(taskId);
		if (!session || session.taskId !== taskId) return null;
		return session;
	}

	getVoiceChatSession(sessionId: string): VoiceChatSession | null {
		return this.voiceChatSessions.get(String(sessionId || "").trim()) || null;
	}

	getVoiceChatSessionByTaskId(taskId: string): VoiceChatSession | null {
		const sessionId = this.voiceChatSessionIdByTaskId.get(
			String(taskId || "").trim(),
		);
		if (!sessionId) return null;
		return this.voiceChatSessions.get(sessionId) || null;
	}

	bindBlockTask(session: VoiceSession, taskId: string, text: string): void {
		if (session.taskId) {
			this.clearBlockTask(session.taskId);
		}
		session.taskId = taskId;
		session.text = text;
		session.completed = false;
		session.sampleRate = undefined;
		session.channels = undefined;
		this.sessionKeyByTaskId.set(taskId, session.key);
	}

	bindVoiceChatTask(session: VoiceChatSession, taskId: string): void {
		if (session.taskId) {
			this.clearVoiceChatTask(session.taskId);
		}
		session.taskId = taskId;
		this.voiceChatSessionIdByTaskId.set(taskId, session.sessionId);
	}

	clearBlockTask(taskId: string): VoiceSession | null {
		const session = this.getBlockSessionByTaskId(taskId);
		this.sessionKeyByTaskId.delete(taskId);
		this.taskAudioFormatById.delete(taskId);
		if (session?.taskId === taskId) {
			session.taskId = "";
		}
		return session;
	}

	clearVoiceChatTask(taskId: string): VoiceChatSession | null {
		const session = this.getVoiceChatSessionByTaskId(taskId);
		this.voiceChatSessionIdByTaskId.delete(taskId);
		this.taskAudioFormatById.delete(taskId);
		if (session?.taskId === taskId) {
			session.taskId = "";
		}
		return session;
	}

	removeBlockSession(session: VoiceSession): void {
		if (session.taskId) {
			this.clearBlockTask(session.taskId);
		}
		this.sessionsByKey.delete(session.key);
	}

	deleteVoiceChatSession(sessionId: string): void {
		this.voiceChatSessions.delete(String(sessionId || "").trim());
	}

	getTaskAudioFormat(taskId: string): VoiceTaskAudioFormat {
		const saved = this.taskAudioFormatById.get(taskId);
		if (saved) return saved;
		return {
			sampleRate: DEFAULT_SAMPLE_RATE,
			channels: DEFAULT_CHANNELS,
		};
	}

	setTaskAudioFormat(taskId: string, format: VoiceTaskAudioFormat): void {
		this.taskAudioFormatById.set(taskId, format);
	}

	clearTaskAudioFormat(taskId: string): void {
		this.taskAudioFormatById.delete(taskId);
	}

	reset(): void {
		this.sessionsByKey.clear();
		this.sessionKeyByTaskId.clear();
		this.voiceChatSessions.clear();
		this.voiceChatSessionIdByTaskId.clear();
		this.taskAudioFormatById.clear();
	}
}
