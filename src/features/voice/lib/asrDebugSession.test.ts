import {
	AsrDebugSession,
	type AsrDebugStatePatch,
} from "@/features/voice/lib/asrDebugSession";
import { createVoiceAudioCaptureState } from "@/features/voice/lib/voiceAudioCapture";

class MockWebSocket {
	static instances: MockWebSocket[] = [];
	static OPEN = 1;
	static CONNECTING = 0;

	OPEN = 1;
	CONNECTING = 0;
	readyState = MockWebSocket.CONNECTING;
	binaryType = "arraybuffer";
	url: string;
	sentFrames: string[] = [];
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onerror: (() => void) | null = null;
	onclose: (() => void) | null = null;

	constructor(url: string) {
		this.url = url;
		MockWebSocket.instances.push(this);
	}

	send(frame: string) {
		this.sentFrames.push(frame);
	}

	close() {
		this.readyState = 3;
		this.onclose?.();
	}

	open() {
		this.readyState = MockWebSocket.OPEN;
		this.onopen?.();
	}

	message(payload: Record<string, unknown>) {
		this.onmessage?.({ data: JSON.stringify(payload) });
	}
}

function parseFrame(frame: string): Record<string, unknown> {
	return JSON.parse(frame) as Record<string, unknown>;
}

describe("AsrDebugSession", () => {
	const originalWindow = globalThis.window;
	const originalWebSocket = globalThis.WebSocket;

	beforeEach(() => {
		MockWebSocket.instances = [];
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {
				location: {
					protocol: "http:",
					host: "localhost:11948",
				},
				setTimeout,
				clearTimeout,
			},
		});
		(globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket =
			MockWebSocket as unknown as typeof WebSocket;
	});

	afterEach(() => {
		if (originalWindow) {
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				value: originalWindow,
			});
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

	it("connects with access_token, streams audio, and captures final text", async () => {
		const patches: AsrDebugStatePatch[] = [];
		const session = new AsrDebugSession({
			getAccessToken: () => "token_abc",
			getVoiceWsPath: () => "/api/voice/ws",
			getAsrDefaults: () => ({
				sampleRate: 16000,
				language: "zh",
			}),
			onState: (patch) => patches.push(patch),
			webSocketCtor: MockWebSocket as unknown as typeof WebSocket,
			audioCaptureFactory: () => createVoiceAudioCaptureState(),
			audioCaptureInitializer: async (state, onChunk) => {
				state.captureStarted = true;
				state.remain = new Uint8Array([4, 5]);
				onChunk(new Uint8Array([1, 2, 3]));
				return true;
			},
		});

		const startPromise = session.start();
		const socket = MockWebSocket.instances[0];
		expect(socket.url).toBe(
			"ws://localhost:11948/api/voice/ws?access_token=token_abc",
		);
		socket.open();
		await startPromise;

		expect(parseFrame(socket.sentFrames[0])).toMatchObject({
			type: "asr.start",
			taskId: expect.stringMatching(/^settings_asr_/),
			sampleRate: 16000,
			language: "zh",
			clientGate: {
				enabled: true,
				rmsThreshold: 0.008,
				openHoldMs: 120,
				closeHoldMs: 480,
				preRollMs: 240,
			},
		});

		socket.message({
			type: "task.started",
			taskId: parseFrame(socket.sentFrames[0]).taskId,
		});
		await Promise.resolve();

		expect(parseFrame(socket.sentFrames[1])).toEqual({
			type: "asr.audio.append",
			taskId: parseFrame(socket.sentFrames[0]).taskId,
			audio: "AQID",
		});

		socket.message({
			type: "asr.text.final",
			taskId: parseFrame(socket.sentFrames[0]).taskId,
			text: "你好世界",
		});

		expect(patches.some((patch) => patch.finalText === "你好世界")).toBe(true);

		session.stopAndCommit();

		expect(parseFrame(socket.sentFrames[2])).toEqual({
			type: "asr.audio.append",
			taskId: parseFrame(socket.sentFrames[0]).taskId,
			audio: "BAU=",
		});
		expect(parseFrame(socket.sentFrames[3])).toEqual({
			type: "asr.audio.commit",
			taskId: parseFrame(socket.sentFrames[0]).taskId,
		});
		expect(parseFrame(socket.sentFrames[4])).toEqual({
			type: "asr.stop",
			taskId: parseFrame(socket.sentFrames[0]).taskId,
		});

		socket.message({
			type: "task.stopped",
			taskId: parseFrame(socket.sentFrames[0]).taskId,
			reason: "done",
		});

		expect(patches.some((patch) => patch.status === "idle")).toBe(true);
		session.destroy();
	});

	it("fails fast when access token is missing", async () => {
		const session = new AsrDebugSession({
			getAccessToken: () => "",
			getVoiceWsPath: () => "/api/voice/ws",
			getAsrDefaults: () => undefined,
			onState: () => undefined,
		});

		await expect(session.start()).rejects.toThrow(
			"voice access_token is required",
		);
	});

	it("can start again after stopAndCommit completes", async () => {
		const taskIds: string[] = [];
		const session = new AsrDebugSession({
			getAccessToken: () => "token_abc",
			getVoiceWsPath: () => "/api/voice/ws",
			getAsrDefaults: () => undefined,
			onState: () => undefined,
			webSocketCtor: MockWebSocket as unknown as typeof WebSocket,
			taskIdFactory: () => {
				const taskId = `task_${taskIds.length + 1}`;
				taskIds.push(taskId);
				return taskId;
			},
			audioCaptureFactory: () => createVoiceAudioCaptureState(),
			audioCaptureInitializer: async (state) => {
				state.captureStarted = true;
				return true;
			},
		});

		const firstStart = session.start();
		const firstSocket = MockWebSocket.instances[0];
		firstSocket.open();
		await firstStart;
		firstSocket.message({ type: "task.started", taskId: "task_1" });
		session.stopAndCommit();
		firstSocket.message({ type: "task.stopped", taskId: "task_1" });

		const secondStart = session.start();
		const secondSocket = MockWebSocket.instances[1];
		secondSocket.open();
		await secondStart;

		expect(parseFrame(firstSocket.sentFrames[0]).taskId).toBe("task_1");
		expect(parseFrame(secondSocket.sentFrames[0]).taskId).toBe("task_2");
		session.destroy();
	});
});
