import {
	DEFAULT_VOICE_ASR_DEFAULTS,
	DEFAULT_VOICE_CLIENT_GATE,
	DEFAULT_VOICE_WS_PATH,
	buildVoiceAsrStartPayload,
	buildVoiceAsrStopFrames,
	mergeVoiceAsrDefaults,
	resolveDefaultVoiceAsrDefaults,
	resolveVoiceClientGateEnvDefaults,
	resolveVoiceAsrRuntimeConfig,
} from "@/features/voice/lib/voiceAsrProtocol";

describe("voiceAsrProtocol helpers", () => {
	const envKeys = [
		"__APP_VOICE_ASR_CLIENT_GATE_ENABLED__",
		"__APP_VOICE_ASR_CLIENT_GATE_RMS_THRESHOLD__",
		"__APP_VOICE_ASR_CLIENT_GATE_OPEN_HOLD_MS__",
		"__APP_VOICE_ASR_CLIENT_GATE_CLOSE_HOLD_MS__",
		"__APP_VOICE_ASR_CLIENT_GATE_PRE_ROLL_MS__",
	] as const;

	afterEach(() => {
		for (const key of envKeys) {
			delete (globalThis as Record<string, unknown>)[key];
		}
	});

	it("builds an asr.start payload from backend defaults", () => {
		expect(
			buildVoiceAsrStartPayload("qa-asr", {
				sampleRate: 24000,
				language: "en",
				clientGate: {
					enabled: true,
					rmsThreshold: 0.02,
					openHoldMs: 160,
					closeHoldMs: 640,
					preRollMs: 300,
				},
				turnDetection: {
					type: "server_vad",
					threshold: 0.4,
					silenceDurationMs: 900,
				},
			}),
		).toEqual({
			type: "asr.start",
			taskId: "qa-asr",
			sampleRate: 24000,
			language: "en",
			clientGate: {
				enabled: true,
				rmsThreshold: 0.02,
				openHoldMs: 160,
				closeHoldMs: 640,
				preRollMs: 300,
			},
			turnDetection: {
				type: "server_vad",
				threshold: 0.4,
				silenceDurationMs: 900,
			},
		});
	});

	it("builds stop frames with a final append when remainder exists", () => {
		expect(buildVoiceAsrStopFrames("qa-asr", new Uint8Array([1, 2, 3]))).toEqual([
			{
				type: "asr.audio.append",
				taskId: "qa-asr",
				audio: "AQID",
			},
			{ type: "asr.audio.commit", taskId: "qa-asr" },
			{ type: "asr.stop", taskId: "qa-asr" },
		]);
	});

	it("falls back to default websocket path and asr defaults", () => {
		expect(resolveVoiceAsrRuntimeConfig(null)).toEqual({
			websocketPath: DEFAULT_VOICE_WS_PATH,
			asrDefaults: resolveDefaultVoiceAsrDefaults(),
		});
	});

	it("reads client gate defaults from injected frontend env values", () => {
		(globalThis as Record<string, unknown>).__APP_VOICE_ASR_CLIENT_GATE_ENABLED__ =
			"false";
		(globalThis as Record<string, unknown>).__APP_VOICE_ASR_CLIENT_GATE_RMS_THRESHOLD__ =
			"0.015";
		(globalThis as Record<string, unknown>).__APP_VOICE_ASR_CLIENT_GATE_OPEN_HOLD_MS__ =
			"150";
		(globalThis as Record<string, unknown>).__APP_VOICE_ASR_CLIENT_GATE_CLOSE_HOLD_MS__ =
			"700";
		(globalThis as Record<string, unknown>).__APP_VOICE_ASR_CLIENT_GATE_PRE_ROLL_MS__ =
			"280";

		expect(resolveVoiceClientGateEnvDefaults()).toEqual({
			enabled: false,
			rmsThreshold: 0.015,
			openHoldMs: 150,
			closeHoldMs: 700,
			preRollMs: 280,
		});
	});

	it("merges env defaults with backend client gate settings", () => {
		(globalThis as Record<string, unknown>).__APP_VOICE_ASR_CLIENT_GATE_RMS_THRESHOLD__ =
			"0.015";

		expect(
			mergeVoiceAsrDefaults({
				...DEFAULT_VOICE_ASR_DEFAULTS,
				clientGate: {
					openHoldMs: 80,
				},
			}),
		).toMatchObject({
			clientGate: {
				enabled: DEFAULT_VOICE_CLIENT_GATE.enabled,
				rmsThreshold: 0.015,
				openHoldMs: 80,
				closeHoldMs: DEFAULT_VOICE_CLIENT_GATE.closeHoldMs,
				preRollMs: DEFAULT_VOICE_CLIENT_GATE.preRollMs,
			},
		});
	});

	it("prefers session client gate overrides over capabilities defaults", () => {
		expect(
			resolveVoiceAsrRuntimeConfig(
				{
					asr: {
						defaults: {
							clientGate: {
								rmsThreshold: 0.01,
								openHoldMs: 90,
							},
						},
					},
				},
				{
					rmsThreshold: 0.02,
				},
				true,
			).asrDefaults.clientGate,
		).toEqual({
			enabled: true,
			rmsThreshold: 0.02,
			openHoldMs: 90,
			closeHoldMs: 480,
			preRollMs: 240,
		});
	});
});
