import { useCallback } from "react";
import { buildVoiceAsrStartPayload } from "@/features/voice/lib/voiceAsrProtocol";
import { QA_ASR_TASK_ID } from "@/features/voice/lib/voiceChatRuntimeUtils";
import type { VoiceChatRuntimeController } from "@/features/voice/hooks/useVoiceChatRuntimeController";

export function useVoiceChatAsrTask(controller: VoiceChatRuntimeController) {
	const startAsrTask = useCallback(
		(reason: string) => {
			if (
				controller.asrTaskActiveRef.current ||
				controller.asrStartInFlightRef.current
			) {
				return true;
			}
			const runtimeConfig = controller.resolveCurrentAsrRuntime();
			const sent = controller.sendJson(
				buildVoiceAsrStartPayload(
					QA_ASR_TASK_ID,
					runtimeConfig.asrDefaults,
				),
			);
			if (!sent) {
				return false;
			}
			controller.asrTaskActiveRef.current = false;
			controller.asrStartInFlightRef.current = true;
			controller.asrRestartPendingRef.current = false;
			controller.asrChunkCounterRef.current = 0;
			controller.appendDebug(`sent asr.start (${reason})`);
			return true;
		},
		[controller],
	);

	return { startAsrTask };
}

