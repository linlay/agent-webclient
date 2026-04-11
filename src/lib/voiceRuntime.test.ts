import { AGENT_APP_ACCESS_TOKEN_STORAGE_KEY } from "./appAuth";
import type { AppState, TtsVoiceBlock } from "../context/types";
import { setAccessToken } from "./apiClient";
import { initVoiceRuntime } from "./voiceRuntime";

class MockWebSocket {
	static instances: MockWebSocket[] = [];
	static CONNECTING = 0;
	static OPEN = 1;

	CONNECTING = 0;
	OPEN = 1;
	readyState = MockWebSocket.CONNECTING;
	binaryType = "arraybuffer";
	url: string;
	sentFrames: string[] = [];
	private listeners = new Map<string, Array<(event?: unknown) => void>>();

	constructor(url: string) {
		this.url = url;
		MockWebSocket.instances.push(this);
		queueMicrotask(() => {
			this.readyState = MockWebSocket.OPEN;
			this.emit("open");
		});
	}

	addEventListener(type: string, handler: (event?: unknown) => void) {
		const current = this.listeners.get(type) || [];
		current.push(handler);
		this.listeners.set(type, current);
	}

	send(frame: string) {
		this.sentFrames.push(frame);
	}

	close() {
		this.readyState = 3;
	}

	emit(type: string, event?: unknown) {
		for (const handler of this.listeners.get(type) || []) {
			handler(event);
		}
	}
}

class HangingWebSocket {
	static instances: HangingWebSocket[] = [];
	static CONNECTING = 0;
	static OPEN = 1;

	CONNECTING = 0;
	OPEN = 1;
	readyState = HangingWebSocket.CONNECTING;
	binaryType = "arraybuffer";
	url: string;

	constructor(url: string) {
		this.url = url;
		HangingWebSocket.instances.push(this);
	}

	addEventListener() {
		return undefined;
	}

	send() {
		return undefined;
	}

	close() {
		this.readyState = 3;
	}
}

class MockAudioBuffer {
	duration: number;
	private channels: Float32Array[];

	constructor(channelCount: number, frameCount: number, sampleRate: number) {
		this.duration = frameCount / sampleRate;
		this.channels = Array.from(
			{ length: channelCount },
			() => new Float32Array(frameCount),
		);
	}

	getChannelData(index: number) {
		return this.channels[index];
	}
}

class MockAudioBufferSource {
	buffer: MockAudioBuffer | null = null;

	connect() {
		return undefined;
	}

	start() {
		return undefined;
	}
}

class MockAudioContext {
	state: AudioContextState = "running";
	currentTime = 0;
	destination = {};

	resume() {
		this.state = "running";
		return Promise.resolve();
	}

	close() {
		return Promise.resolve();
	}

	createBuffer(channels: number, frameCount: number, sampleRate: number) {
		return new MockAudioBuffer(
			channels,
			frameCount,
			sampleRate,
		) as unknown as AudioBuffer;
	}

	createBufferSource() {
		return new MockAudioBufferSource() as unknown as AudioBufferSourceNode;
	}
}

type InstallBrowserOptions = {
	pathname?: string;
	storedToken?: string;
};

function createMockStorage(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => (values.has(key) ? values.get(key) || null : null),
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		},
	};
}

function installBrowser(
	WebSocketCtor: typeof WebSocket,
	options: InstallBrowserOptions = {},
): void {
	const sessionStorage = createMockStorage(
		options.storedToken
			? { [AGENT_APP_ACCESS_TOKEN_STORAGE_KEY]: options.storedToken }
			: {},
	);
	(globalThis as unknown as { window?: Window & typeof globalThis }).window = {
		location: {
			protocol: "http:",
			host: "localhost:3000",
			pathname: options.pathname ?? "/",
		},
		WebSocket: WebSocketCtor,
		AudioContext: MockAudioContext as unknown as typeof AudioContext,
		sessionStorage,
		setTimeout,
		clearTimeout,
	} as Window & typeof globalThis;
	(globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket =
		WebSocketCtor;
}

function flushMicrotasks(): Promise<void> {
	return new Promise((resolve) => queueMicrotask(resolve));
}

function parseFrame(frame: string): Record<string, unknown> {
	return JSON.parse(frame) as Record<string, unknown>;
}

describe("voiceRuntime v2 protocol", () => {
	const originalWindow = globalThis.window;
	const originalWebSocket = globalThis.WebSocket;

	afterEach(() => {
		MockWebSocket.instances = [];
		HangingWebSocket.instances = [];
		jest.useRealTimers();
		setAccessToken("");
		if (originalWindow) {
			(globalThis as unknown as { window?: Window & typeof globalThis }).window =
				originalWindow;
		} else {
			delete (globalThis as Record<string, unknown>).window;
		}
		if (originalWebSocket) {
			(globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket =
				originalWebSocket;
		} else {
			delete (globalThis as Record<string, unknown>).WebSocket;
		}
	});

	it("reports token errors and resets debug status to idle", async () => {
		const statuses: string[] = [];
		const runtime = initVoiceRuntime({
			getState: () => ({ accessToken: "" } as AppState),
			onPatchBlock: () => undefined,
			onRemoveInactiveBlocks: () => undefined,
			onDebugStatus: (status) => statuses.push(status),
		});

		await expect(runtime.debugSpeakTtsVoice("hello")).rejects.toThrow(
			"voice access_token is required",
		);

		expect(statuses[statuses.length - 1]).toBe(
			"error: voice access_token is required",
		);

		runtime.resetVoiceRuntime();
		expect(statuses[statuses.length - 1]).toBe("idle");
	});

	it("tracks debug playback status transitions on the new voice websocket path", async () => {
		const statuses: string[] = [];
		installBrowser(MockWebSocket as unknown as typeof WebSocket);

		const runtime = initVoiceRuntime({
			getState: () =>
				({
					accessToken: "token_abc",
					chatId: "chat_1",
					voiceChat: { capabilities: null },
				}) as AppState,
			onPatchBlock: () => undefined,
			onRemoveInactiveBlocks: () => undefined,
			onDebugStatus: (status) => statuses.push(status),
		});

		const taskId = await runtime.debugSpeakTtsVoice("hello world");
		const socket = MockWebSocket.instances[0];
		expect(socket.url).toBe(
			"ws://localhost:3000/api/voice/ws?access_token=token_abc",
		);
		expect(parseFrame(socket.sentFrames[0])).toMatchObject({
			type: "tts.start",
			taskId,
			mode: "local",
			text: "hello world",
			chatId: "chat_1",
		});
		expect(statuses[statuses.length - 1]).toBe("socket open");

		socket.emit("message", {
			data: JSON.stringify({
				type: "connection.ready",
				protocolVersion: "v2",
			}),
		});
		socket.emit("message", {
			data: JSON.stringify({
				type: "task.started",
				taskId,
				taskType: "tts",
				mode: "local",
			}),
		});
		expect(statuses[statuses.length - 1]).toBe("tts started");

		socket.emit("message", {
			data: new Uint8Array([0, 0, 0, 0]).buffer,
		});
		expect(statuses[statuses.length - 1]).toBe("tts started");

		socket.emit("message", {
			data: JSON.stringify({
				type: "tts.audio.format",
				taskId,
				sampleRate: 24000,
				channels: 1,
			}),
		});
		socket.emit("message", {
			data: JSON.stringify({
				type: "tts.audio.chunk",
				taskId,
				seq: 1,
				byteLength: 4,
			}),
		});
		socket.emit("message", {
			data: new Uint8Array([0, 0, 0, 0]).buffer,
		});
		expect(statuses[statuses.length - 1]).toBe("playing (1 frames, 4 bytes)");

		socket.emit("message", {
			data: JSON.stringify({
				type: "tts.done",
				taskId,
				reason: "completed",
			}),
		});
		expect(statuses[statuses.length - 1]).toBe("done (1 frames, 4 bytes)");

		socket.emit("message", {
			data: JSON.stringify({
				type: "task.stopped",
				taskId,
				taskType: "tts",
				reason: "completed",
			}),
		});
		expect(statuses[statuses.length - 1]).toBe("done (1 frames, 4 bytes)");

		runtime.stopAllVoiceSessions("debug_stop", { mode: "stop" });
		expect(statuses[statuses.length - 1]).toBe("stopped");
	});

	it("uses the app bridge token for voice websocket requests in app mode", async () => {
		installBrowser(MockWebSocket as unknown as typeof WebSocket, {
			pathname: "/appagent",
			storedToken: "bridge-token",
		});

		const runtime = initVoiceRuntime({
			getState: () =>
				({
					accessToken: "",
					chatId: "chat_1",
					voiceChat: { capabilities: null },
				}) as AppState,
			onPatchBlock: () => undefined,
			onRemoveInactiveBlocks: () => undefined,
			onDebugStatus: () => undefined,
		});

		await runtime.debugSpeakTtsVoice("hello bridge");

		expect(MockWebSocket.instances[0].url).toBe(
			"ws://localhost:3000/api/voice/ws?access_token=bridge-token",
		);
	});

	it("marks debug sessions with no audio payload as connected but no audio frames", async () => {
		const statuses: string[] = [];
		installBrowser(MockWebSocket as unknown as typeof WebSocket);

		const runtime = initVoiceRuntime({
			getState: () =>
				({
					accessToken: "token_abc",
					chatId: "chat_1",
					voiceChat: { capabilities: null },
				}) as AppState,
			onPatchBlock: () => undefined,
			onRemoveInactiveBlocks: () => undefined,
			onDebugStatus: (status) => statuses.push(status),
		});

		const taskId = await runtime.debugSpeakTtsVoice("hello world");
		const socket = MockWebSocket.instances[0];
		socket.emit("message", {
			data: JSON.stringify({
				type: "task.started",
				taskId,
				taskType: "tts",
			}),
		});
		socket.emit("message", {
			data: JSON.stringify({
				type: "tts.done",
				taskId,
			}),
		});

		expect(statuses[statuses.length - 1]).toBe(
			"connected but no audio frames",
		);
	});

	it("restarts tts voice blocks on every text delta and ignores stale task completions", async () => {
		installBrowser(MockWebSocket as unknown as typeof WebSocket);
		const blockState = new Map<string, Partial<TtsVoiceBlock>>();

		const runtime = initVoiceRuntime({
			getState: () =>
				({
					accessToken: "token_abc",
					chatId: "chat_1",
					voiceChat: { capabilities: null },
				}) as AppState,
			onPatchBlock: (_contentId, signature, patch) => {
				blockState.set(signature, {
					...(blockState.get(signature) || {}),
					...patch,
				});
			},
			onRemoveInactiveBlocks: () => undefined,
		});

		runtime.processTtsVoiceBlocks(
			"content_1",
			"```tts-voice\nhello\n```",
			"running",
			"live",
		);
		await flushMicrotasks();

		const socket = MockWebSocket.instances[0];
		const firstStart = parseFrame(socket.sentFrames[0]);
		const firstTaskId = String(firstStart.taskId);
		expect(firstStart).toMatchObject({
			type: "tts.start",
			taskId: firstTaskId,
			text: "hello\n",
		});

		runtime.processTtsVoiceBlocks(
			"content_1",
			"```tts-voice\nhello world\n```",
			"running",
			"live",
		);

		const stopFrame = parseFrame(socket.sentFrames[1]);
		const secondStart = parseFrame(socket.sentFrames[2]);
		const secondTaskId = String(secondStart.taskId);

		expect(stopFrame).toMatchObject({
			type: "tts.stop",
			taskId: firstTaskId,
		});
		expect(secondStart).toMatchObject({
			type: "tts.start",
			taskId: secondTaskId,
			text: "hello world\n",
		});
		expect(secondTaskId).not.toBe(firstTaskId);

		socket.emit("message", {
			data: JSON.stringify({
				type: "tts.done",
				taskId: firstTaskId,
				reason: "completed",
			}),
		});
		socket.emit("message", {
			data: JSON.stringify({
				type: "task.stopped",
				taskId: firstTaskId,
				taskType: "tts",
				reason: "completed",
			}),
		});

		const signature = Array.from(blockState.keys())[0];
		expect(blockState.get(signature)?.status).toBe("connecting");
	});

	it("replays a specific tts voice block on demand", async () => {
		installBrowser(MockWebSocket as unknown as typeof WebSocket);
		const blockState = new Map<string, Partial<TtsVoiceBlock>>();

		const runtime = initVoiceRuntime({
			getState: () =>
				({
					accessToken: "token_abc",
					chatId: "chat_1",
					voiceChat: { capabilities: null },
				}) as AppState,
			onPatchBlock: (_contentId, signature, patch) => {
				blockState.set(signature, {
					...(blockState.get(signature) || {}),
					...patch,
				});
			},
			onRemoveInactiveBlocks: () => undefined,
		});

		await runtime.replayTtsVoiceBlock(
			"content_1",
			"content_1::tts-voice::0",
			"hello world",
		);
		await flushMicrotasks();

		const socket = MockWebSocket.instances[0];
		expect(parseFrame(socket.sentFrames[0])).toMatchObject({
			type: "tts.start",
			text: "hello world",
			chatId: "chat_1",
		});
		expect(blockState.get("content_1::tts-voice::0")).toMatchObject({
			text: "hello world",
			closed: true,
			status: "connecting",
		});
	});

	it("streams voice chat content through a single appendable tts task", async () => {
		installBrowser(MockWebSocket as unknown as typeof WebSocket);

		const runtime = initVoiceRuntime({
			getState: () =>
				({
					accessToken: "token_abc",
					chatId: "chat_1",
					voiceChat: { capabilities: null },
				}) as AppState,
			onPatchBlock: () => undefined,
			onRemoveInactiveBlocks: () => undefined,
		});

		await expect(
			runtime.syncVoiceChatSession("voice_content_1", "你好", {
				voice: "alloy",
				speechRate: 1.15,
			}),
		).resolves.toMatchObject({
			started: true,
			appended: true,
		});
		await flushMicrotasks();
		expect(MockWebSocket.instances).toHaveLength(1);

		const socket = MockWebSocket.instances[0];
		expect(parseFrame(socket.sentFrames[0])).toMatchObject({
			type: "tts.start",
			mode: "local",
			inputMode: "stream",
			voice: "alloy",
			speechRate: 1.15,
			chatId: "chat_1",
		});
		const taskId = String(parseFrame(socket.sentFrames[0]).taskId || "");
		expect(parseFrame(socket.sentFrames[1])).toMatchObject({
			type: "tts.append",
			taskId,
			text: "你好",
		});

		await expect(
			runtime.syncVoiceChatSession("voice_content_1", "你好世界朋友", {
				voice: "alloy",
				speechRate: 1.15,
			}),
		).resolves.toMatchObject({
			started: false,
			appended: true,
			taskId,
		});
		expect(parseFrame(socket.sentFrames[2])).toMatchObject({
			type: "tts.append",
			taskId,
			text: "世界朋友",
		});

		await expect(
			runtime.syncVoiceChatSession("voice_content_1", "你好世界朋友们欢迎呀", {
				voice: "alloy",
				speechRate: 1.15,
			}),
		).resolves.toMatchObject({
			started: false,
			appended: true,
			taskId,
		});
		expect(parseFrame(socket.sentFrames[3])).toMatchObject({
			type: "tts.append",
			taskId,
			text: "们欢迎呀",
		});
	});

	it("commits the active voice chat tts task after the query stream ends", async () => {
		installBrowser(MockWebSocket as unknown as typeof WebSocket);

		const runtime = initVoiceRuntime({
			getState: () =>
				({
					accessToken: "token_abc",
					chatId: "chat_1",
					voiceChat: { capabilities: null },
				}) as AppState,
			onPatchBlock: () => undefined,
			onRemoveInactiveBlocks: () => undefined,
		});

		const syncResult = await runtime.syncVoiceChatSession("voice_content_tail", "你好", {
			voice: "alloy",
		});
		expect(syncResult).toMatchObject({
			started: true,
			appended: true,
		});
		const commitPromise = runtime.commitVoiceChatSession("voice_content_tail");
		await flushMicrotasks();
		await flushMicrotasks();
		await flushMicrotasks();

		const socket = MockWebSocket.instances[0];
		const firstFrame = parseFrame(socket.sentFrames[0]);
		const taskId = String(firstFrame.taskId || "");
		expect(firstFrame).toMatchObject({
			type: "tts.start",
			inputMode: "stream",
			voice: "alloy",
			chatId: "chat_1",
		});
		expect(parseFrame(socket.sentFrames[1])).toMatchObject({
			type: "tts.append",
			taskId,
			text: "你好",
		});
		expect(parseFrame(socket.sentFrames[2])).toMatchObject({
			type: "tts.commit",
			taskId,
		});

		socket.emit("message", {
			data: JSON.stringify({
				type: "task.stopped",
				taskId,
				taskType: "tts",
				reason: "completed",
			}),
		});

		await expect(commitPromise).resolves.toBeUndefined();
	});

	it("times out pending websocket handshakes instead of waiting forever", async () => {
		jest.useFakeTimers();

		const statuses: string[] = [];
		installBrowser(HangingWebSocket as unknown as typeof WebSocket);

		const runtime = initVoiceRuntime({
			getState: () =>
				({
					accessToken: "token_abc",
					chatId: "chat_1",
					voiceChat: { capabilities: null },
				}) as AppState,
			onPatchBlock: () => undefined,
			onRemoveInactiveBlocks: () => undefined,
			onDebugStatus: (status) => statuses.push(status),
		});

		const pending = runtime.debugSpeakTtsVoice("hello world");
		const assertion = expect(pending).rejects.toThrow(
			"voice websocket connect timeout",
		);
		await jest.advanceTimersByTimeAsync(8000);

		await assertion;
		expect(statuses[statuses.length - 1]).toBe(
			"error: voice websocket connect timeout",
		);
	});
});
