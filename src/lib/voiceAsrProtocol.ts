import type { VoiceCapabilities } from "../context/types";
import { bytesToBase64 } from "./voiceChatAudio";

export const DEFAULT_VOICE_WS_PATH = "/api/voice/ws";
export type VoiceAsrDefaults = NonNullable<
	NonNullable<VoiceCapabilities["asr"]>["defaults"]
>;

export const DEFAULT_VOICE_ASR_DEFAULTS: VoiceAsrDefaults = {
	sampleRate: 16000,
	language: "zh",
	turnDetection: {
		type: "server_vad",
		threshold: 0,
		silenceDurationMs: 400,
	},
};

export function resolveVoiceAsrRuntimeConfig(
	capabilities?: VoiceCapabilities | null,
): { websocketPath: string; asrDefaults: VoiceAsrDefaults } {
	return {
		websocketPath:
			String(capabilities?.websocketPath || "").trim() || DEFAULT_VOICE_WS_PATH,
		asrDefaults: {
			...DEFAULT_VOICE_ASR_DEFAULTS,
			...(capabilities?.asr?.defaults || {}),
			turnDetection: {
				...DEFAULT_VOICE_ASR_DEFAULTS.turnDetection,
				...(capabilities?.asr?.defaults?.turnDetection || {}),
			},
		},
	};
}

export function buildVoiceAsrStartPayload(
	taskId: string,
	defaults?: VoiceAsrDefaults,
): Record<string, unknown> {
	return {
		type: "asr.start",
		taskId,
		sampleRate: Number(defaults?.sampleRate) || 16000,
		language: String(defaults?.language || "zh"),
		turnDetection: {
			type: String(defaults?.turnDetection?.type || "server_vad"),
			threshold: Number(defaults?.turnDetection?.threshold) || 0,
			silenceDurationMs:
				Number(defaults?.turnDetection?.silenceDurationMs) || 400,
		},
	};
}

export function buildVoiceAsrStopFrames(
	taskId: string,
	remain: Uint8Array,
): Array<Record<string, unknown>> {
	const frames: Array<Record<string, unknown>> = [];
	if (remain.length > 0) {
		frames.push({
			type: "asr.audio.append",
			taskId,
			audio: bytesToBase64(remain),
		});
	}
	frames.push({ type: "asr.audio.commit", taskId });
	frames.push({ type: "asr.stop", taskId });
	return frames;
}
