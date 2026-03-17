import {
	DEFAULT_VOICE_ASR_DEFAULTS,
	DEFAULT_VOICE_WS_PATH,
	buildVoiceAsrStartPayload,
	buildVoiceAsrStopFrames,
	resolveVoiceAsrRuntimeConfig,
} from "./voiceAsrProtocol";

describe("voiceAsrProtocol helpers", () => {
	it("builds an asr.start payload from backend defaults", () => {
		expect(
			buildVoiceAsrStartPayload("qa-asr", {
				sampleRate: 24000,
				language: "en",
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
			asrDefaults: DEFAULT_VOICE_ASR_DEFAULTS,
		});
	});
});
