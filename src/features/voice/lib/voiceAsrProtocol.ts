import type {
	VoiceCapabilities,
	VoiceClientGateConfig,
	VoiceClientGateSettings,
} from "@/app/state/types";
import { bytesToBase64 } from "@/features/voice/lib/voiceChatAudio";

export const DEFAULT_VOICE_WS_PATH = "/api/voice/ws";
export type VoiceAsrDefaultsInput = NonNullable<
	NonNullable<VoiceCapabilities["asr"]>["defaults"]
>;

export interface VoiceAsrDefaults {
	sampleRate: number;
	language: string;
	clientGate: VoiceClientGateConfig;
	turnDetection: {
		type: string;
		threshold: number;
		silenceDurationMs: number;
	};
}

export const DEFAULT_VOICE_CLIENT_GATE: VoiceClientGateConfig = {
	enabled: true,
	rmsThreshold: 0.008,
	openHoldMs: 120,
	closeHoldMs: 480,
	preRollMs: 240,
};

export const DEFAULT_VOICE_ASR_DEFAULTS: VoiceAsrDefaults = {
	sampleRate: 16000,
	language: "zh",
	clientGate: DEFAULT_VOICE_CLIENT_GATE,
	turnDetection: {
		type: "server_vad",
		threshold: 0,
		silenceDurationMs: 400,
	},
};

function readVoiceEnvValue(key: string): unknown {
	return (globalThis as Record<string, unknown>)[key];
}

function parseVoiceEnvBoolean(key: string): boolean | undefined {
	const raw = readVoiceEnvValue(key);
	if (typeof raw === "boolean") return raw;
	if (typeof raw === "string") {
		const normalized = raw.trim().toLowerCase();
		if (normalized === "true") return true;
		if (normalized === "false") return false;
	}
	return undefined;
}

function parseVoiceEnvNumber(key: string): number | undefined {
	const raw = readVoiceEnvValue(key);
	if (typeof raw === "number" && Number.isFinite(raw)) {
		return raw;
	}
	if (typeof raw === "string" && raw.trim()) {
		const parsed = Number(raw);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return undefined;
}

export function normalizeVoiceClientGateConfig(
	settings?: VoiceClientGateSettings | null,
	fallback: VoiceClientGateConfig = DEFAULT_VOICE_CLIENT_GATE,
): VoiceClientGateConfig {
	const next = settings || {};
	return {
		enabled:
			typeof next.enabled === "boolean" ? next.enabled : fallback.enabled,
		rmsThreshold:
			typeof next.rmsThreshold === "number" &&
			Number.isFinite(next.rmsThreshold) &&
			next.rmsThreshold >= 0
				? next.rmsThreshold
				: fallback.rmsThreshold,
		openHoldMs:
			typeof next.openHoldMs === "number" &&
			Number.isFinite(next.openHoldMs) &&
			next.openHoldMs >= 0
				? next.openHoldMs
				: fallback.openHoldMs,
		closeHoldMs:
			typeof next.closeHoldMs === "number" &&
			Number.isFinite(next.closeHoldMs) &&
			next.closeHoldMs >= 0
				? next.closeHoldMs
				: fallback.closeHoldMs,
		preRollMs:
			typeof next.preRollMs === "number" &&
			Number.isFinite(next.preRollMs) &&
			next.preRollMs >= 0
				? next.preRollMs
				: fallback.preRollMs,
	};
}

export function resolveVoiceClientGateEnvDefaults(): VoiceClientGateConfig {
	return normalizeVoiceClientGateConfig(
		{
			enabled: parseVoiceEnvBoolean(
				"__APP_VOICE_ASR_CLIENT_GATE_ENABLED__",
			),
			rmsThreshold: parseVoiceEnvNumber(
				"__APP_VOICE_ASR_CLIENT_GATE_RMS_THRESHOLD__",
			),
			openHoldMs: parseVoiceEnvNumber(
				"__APP_VOICE_ASR_CLIENT_GATE_OPEN_HOLD_MS__",
			),
			closeHoldMs: parseVoiceEnvNumber(
				"__APP_VOICE_ASR_CLIENT_GATE_CLOSE_HOLD_MS__",
			),
			preRollMs: parseVoiceEnvNumber(
				"__APP_VOICE_ASR_CLIENT_GATE_PRE_ROLL_MS__",
			),
		},
		DEFAULT_VOICE_CLIENT_GATE,
	);
}

export function resolveDefaultVoiceAsrDefaults(): VoiceAsrDefaults {
	return mergeVoiceAsrDefaults();
}

export function mergeVoiceAsrDefaults(
	defaults?: VoiceAsrDefaultsInput | VoiceAsrDefaults | null,
): VoiceAsrDefaults {
	return {
		...DEFAULT_VOICE_ASR_DEFAULTS,
		...(defaults || {}),
		clientGate: normalizeVoiceClientGateConfig(
			defaults?.clientGate,
			resolveVoiceClientGateEnvDefaults(),
		),
		turnDetection: {
			...DEFAULT_VOICE_ASR_DEFAULTS.turnDetection,
			...(defaults?.turnDetection || {}),
		},
	};
}

export function resolveVoiceAsrRuntimeConfig(
	capabilities?: VoiceCapabilities | null,
	sessionClientGate?: VoiceClientGateSettings | null,
	preferSessionClientGate = false,
): { websocketPath: string; asrDefaults: VoiceAsrDefaults } {
	const asrDefaults = mergeVoiceAsrDefaults(capabilities?.asr?.defaults);
	return {
		websocketPath:
			String(capabilities?.websocketPath || "").trim() || DEFAULT_VOICE_WS_PATH,
		asrDefaults: preferSessionClientGate
			? {
					...asrDefaults,
					clientGate: normalizeVoiceClientGateConfig(
						sessionClientGate,
						asrDefaults.clientGate as VoiceClientGateConfig,
					),
			  }
			: asrDefaults,
	};
}

export function buildVoiceAsrStartPayload(
	taskId: string,
	defaults?: VoiceAsrDefaultsInput | VoiceAsrDefaults | null,
): Record<string, unknown> {
	const resolvedDefaults = mergeVoiceAsrDefaults(defaults);
	return {
		type: "asr.start",
		taskId,
		sampleRate: Number(resolvedDefaults.sampleRate) || 16000,
		language: String(resolvedDefaults.language || "zh"),
		clientGate: {
			enabled: Boolean(resolvedDefaults.clientGate?.enabled),
			rmsThreshold:
				Number(resolvedDefaults.clientGate?.rmsThreshold) || 0,
			openHoldMs: Number(resolvedDefaults.clientGate?.openHoldMs) || 0,
			closeHoldMs:
				Number(resolvedDefaults.clientGate?.closeHoldMs) || 0,
			preRollMs: Number(resolvedDefaults.clientGate?.preRollMs) || 0,
		},
		turnDetection: {
			type: String(resolvedDefaults.turnDetection?.type || "server_vad"),
			threshold:
				Number(resolvedDefaults.turnDetection?.threshold) || 0,
			silenceDurationMs:
				Number(resolvedDefaults.turnDetection?.silenceDurationMs) || 400,
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
