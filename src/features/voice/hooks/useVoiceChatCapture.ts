import { useCallback, useEffect } from "react";
import {
	cleanupVoiceAudioCapture,
	initializeVoiceAudioCapture,
	reapplyVoiceClientGateConfig,
} from "@/features/voice/lib/voiceAudioCapture";
import { bytesToBase64 } from "@/features/voice/lib/voiceChatAudio";
import {
	areVoiceClientGateConfigsEqual,
	QA_ASR_TASK_ID,
} from "@/features/voice/lib/voiceChatRuntimeUtils";
import type { AppState } from "@/app/state/types";
import type { VoiceChatRuntimeController } from "@/features/voice/hooks/useVoiceChatRuntimeController";

export function useVoiceChatCapture({
	controller,
	state,
}: {
	controller: VoiceChatRuntimeController;
	state: AppState;
}) {
	const ensureAudioCapture = useCallback(async () => {
		if (controller.capturePausedRef.current) return false;
		const runtimeConfig = controller.resolveCurrentAsrRuntime();
		return initializeVoiceAudioCapture(
			controller.audioCaptureStateRef.current,
			(chunk) => {
				const sent = controller.sendJson({
					type: "asr.audio.append",
					taskId: QA_ASR_TASK_ID,
					audio: bytesToBase64(chunk),
				});
				if (!sent) return;
				controller.asrChunkCounterRef.current += 1;
				if (
					controller.asrChunkCounterRef.current === 1 ||
					controller.asrChunkCounterRef.current % 25 === 0
				) {
					controller.appendDebug(
						`sent asr.audio.append (${controller.asrChunkCounterRef.current})`,
					);
				}
			},
			(message) => {
				controller.handleFatalError(message);
			},
			runtimeConfig.asrDefaults.clientGate,
		);
	}, [controller]);

	const pauseAudioCapture = useCallback(() => {
		if (
			!controller.audioCaptureStateRef.current.captureStarted ||
			controller.capturePausedRef.current
		) {
			return;
		}
		controller.capturePausedRef.current = true;
		cleanupVoiceAudioCapture(controller.audioCaptureStateRef.current);
	}, [controller]);

	const resumeAudioCapture = useCallback(async () => {
		if (!controller.capturePausedRef.current) {
			return controller.audioCaptureStateRef.current.captureStarted;
		}
		controller.capturePausedRef.current = false;
		return ensureAudioCapture();
	}, [controller, ensureAudioCapture]);

	useEffect(() => {
		const nextConfig = state.voiceChat.clientGate;
		const previousConfig = controller.clientGateConfigRef.current;
		if (areVoiceClientGateConfigsEqual(previousConfig, nextConfig)) {
			return;
		}

		controller.clientGateConfigRef.current = nextConfig;
		if (state.inputMode !== "voice") {
			return;
		}

		reapplyVoiceClientGateConfig(
			controller.audioCaptureStateRef.current,
			nextConfig,
		);
		controller.appendDebug(
			`client gate reapplied: enabled=${nextConfig.enabled}, rms=${nextConfig.rmsThreshold}, openHoldMs=${nextConfig.openHoldMs}, closeHoldMs=${nextConfig.closeHoldMs}, preRollMs=${nextConfig.preRollMs}`,
		);
	}, [controller, state.inputMode, state.voiceChat.clientGate]);

	return {
		ensureAudioCapture,
		pauseAudioCapture,
		resumeAudioCapture,
	};
}

