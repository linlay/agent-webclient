import type {
	VoiceClientGateConfig,
	VoiceOption,
} from "@/app/state/types";

export const QA_ASR_TASK_ID = "qa-asr";
export const MAX_VOICE_WS_RECONNECT_ATTEMPTS = 4;
export const VOICE_WS_RECONNECT_BASE_DELAY_MS = 600;

export type VoiceTaskEvent = {
	type: string;
	taskId?: string;
	message?: string;
	code?: string;
	reason?: string;
	text?: string;
	chatId?: string;
	sampleRate?: number;
	channels?: number;
	seq?: number;
	byteLength?: number;
	websocketPath?: string;
};

export function areVoiceClientGateConfigsEqual(
	left: VoiceClientGateConfig,
	right: VoiceClientGateConfig,
): boolean {
	return (
		left.enabled === right.enabled &&
		left.rmsThreshold === right.rmsThreshold &&
		left.openHoldMs === right.openHoldMs &&
		left.closeHoldMs === right.closeHoldMs &&
		left.preRollMs === right.preRollMs
	);
}

export function formatVoiceSocketClose(
	event: CloseEvent | Event | undefined,
): string {
	if (!event || typeof event !== "object" || !("code" in event)) {
		return "语音 WebSocket 已关闭";
	}
	const closeEvent = event as CloseEvent;
	const code = Number(closeEvent.code) || 0;
	const reason = String(closeEvent.reason || "").trim();
	const clean = closeEvent.wasClean ? "clean" : "unclean";
	return reason
		? `语音 WebSocket 已关闭 (code=${code}, reason=${reason}, ${clean})`
		: `语音 WebSocket 已关闭 (code=${code}, ${clean})`;
}

export function ensureVoiceOptions(data: unknown): VoiceOption[] {
	const payload = data as { voices?: unknown };
	const voices = Array.isArray(payload?.voices) ? payload.voices : [];
	return voices
		.map((item) => {
			const record = item as Record<string, unknown>;
			return {
				id: String(record.id || "").trim(),
				displayName: String(record.displayName || record.id || "").trim(),
				provider: String(record.provider || "").trim(),
				default: Boolean(record.default),
			};
		})
		.filter((item) => item.id);
}

export function resolveDefaultVoice(
	voices: VoiceOption[],
	currentVoice: string,
	defaultVoiceId: unknown,
): string {
	const current = String(currentVoice || "").trim();
	if (current && voices.some((item) => item.id === current)) {
		return current;
	}
	const preferred = String(defaultVoiceId || "").trim();
	if (preferred && voices.some((item) => item.id === preferred)) {
		return preferred;
	}
	return voices.find((item) => item.default)?.id || voices[0]?.id || "";
}
