import {
	VoiceRuntimeCore,
	type RuntimeOptions,
} from "@/features/voice/lib/voiceRuntimeCore";

let runtime: VoiceRuntimeCore | null = null;

export function initVoiceRuntime(options: RuntimeOptions): VoiceRuntimeCore {
	runtime = new VoiceRuntimeCore(options);
	return runtime;
}

export function getVoiceRuntime(): VoiceRuntimeCore | null {
	return runtime;
}
