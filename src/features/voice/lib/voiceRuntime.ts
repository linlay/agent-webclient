import { t } from "@/shared/i18n";
import {
	VoiceRuntimeCore,
	type RuntimeOptions,
} from "@/features/voice/lib/voiceRuntimeCore";

export const DEFAULT_TTS_DEBUG_TEXT =
	t("voice.debug.defaultTtsText");

let runtime: VoiceRuntimeCore | null = null;

export function initVoiceRuntime(options: RuntimeOptions): VoiceRuntimeCore {
	runtime = new VoiceRuntimeCore(options);
	return runtime;
}

export function getVoiceRuntime(): VoiceRuntimeCore | null {
	return runtime;
}
