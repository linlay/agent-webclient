import { useCallback, useEffect } from "react";
import type { Dispatch } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { AppState } from "@/app/state/types";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { bytesToBase64 } from "@/features/voice/lib/voiceChatAudio";
import {
	buildVoiceAsrStopFrames,
} from "@/features/voice/lib/voiceAsrProtocol";
import {
	flushVoiceAudioCaptureRemainder,
} from "@/features/voice/lib/voiceAudioCapture";
import { QA_ASR_TASK_ID } from "@/features/voice/lib/voiceChatRuntimeUtils";
import { getVoiceRuntime } from "@/features/voice/lib/voiceRuntime";
import { t } from "@/shared/i18n";
import type { VoiceChatRuntimeController } from "@/features/voice/hooks/useVoiceChatRuntimeController";

export function useVoiceChatLifecycle({
	connectSocket,
	controller,
	currentWorker,
	dispatch,
	scheduleVoiceReconnect,
	startAsrTask,
	state,
}: {
	connectSocket: () => Promise<WebSocket>;
	controller: VoiceChatRuntimeController;
	currentWorker: CurrentWorkerSummary | null;
	dispatch: Dispatch<AppAction>;
	scheduleVoiceReconnect: (reason: string) => void;
	startAsrTask: (reason: string) => boolean;
	state: AppState;
}) {
	const startVoiceChatForWorker = useCallback(async () => {
		if (!currentWorker || currentWorker.type !== "agent") {
			dispatch({ type: "SET_INPUT_MODE", mode: "text" });
			return;
		}
		if (controller.startedAgentKeyRef.current === currentWorker.sourceId) {
			return;
		}

		controller.startedAgentKeyRef.current = currentWorker.sourceId;
		dispatch({
			type: "SET_PENDING_NEW_CHAT_AGENT_KEY",
			agentKey: currentWorker.sourceId,
		});
		controller.patchVoiceChat({
			status: "connecting",
			sessionActive: false,
			error: "",
			partialUserText: "",
			partialAssistantText: "",
			activeAssistantContentId: "",
			activeRequestId: "",
			activeTtsTaskId: "",
			ttsCommitted: false,
			currentAgentKey: currentWorker.sourceId,
			currentAgentName: currentWorker.displayName,
		});

		try {
			const accessToken = await controller.ensureVoiceAccessToken();
			if (!accessToken) {
				throw new Error("voice access_token is required");
			}
			const setup = await controller.ensureVoiceSetup();
			if (setup.capabilities?.asr?.configured === false) {
				throw new Error(t("voice.chat.error.asrNotConfigured"));
			}
			if (setup.capabilities?.tts?.streamInput === false) {
				throw new Error(t("voice.chat.error.streamTtsNotEnabled"));
			}
			if (!setup.selectedVoice) {
				throw new Error(t("voice.chat.error.noSelectedVoice"));
			}
			await controller.readyCuePlayerRef.current
				.prime()
				.catch(() => undefined);
			await connectSocket();
			const sent = startAsrTask("initial connect");
			if (!sent) {
				throw new Error(t("voice.chat.error.voiceSocketNotConnected"));
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const recoverable =
				controller.isVoiceRecoveryEligible() &&
				(message.includes("WebSocket") ||
					message.includes(t("voice.chat.error.connectionFailed")) ||
					message.includes(t("voice.chat.error.voiceSocketNotConnected")) ||
					message.includes("connection failed") ||
					message.includes("not connected"));
			if (recoverable) {
				controller.appendDebug(`voice start retry scheduled: ${message}`);
				scheduleVoiceReconnect(message);
				return;
			}
			controller.startedAgentKeyRef.current = "";
			controller.handleFatalError(message);
		}
	}, [
		connectSocket,
		controller,
		currentWorker,
		dispatch,
		scheduleVoiceReconnect,
		startAsrTask,
	]);

	const stopVoiceChatForModeExit = useCallback(() => {
		controller.clearFlushTimer();
		controller.cancelListeningTransition();
		controller.pendingUtteranceRef.current = "";
		const activeAssistantContentId = String(
			controller.stateRef.current.voiceChat.activeAssistantContentId || "",
		).trim();
		if (activeAssistantContentId) {
			getVoiceRuntime()?.stopVoiceChatSession(activeAssistantContentId);
		}
		controller.stateRef.current.abortController?.abort();
		if (
			controller.socketRef.current != null &&
			controller.socketRef.current.readyState === WebSocket.OPEN
		) {
			flushVoiceAudioCaptureRemainder(
				controller.audioCaptureStateRef.current,
				(chunk) => {
					const sent = controller.sendJson({
						type: "asr.audio.append",
						taskId: QA_ASR_TASK_ID,
						audio: bytesToBase64(chunk),
					});
					if (sent) {
						controller.asrChunkCounterRef.current += 1;
						controller.appendDebug(
							`sent asr.audio.append (${controller.asrChunkCounterRef.current})`,
						);
					}
				},
			);
			for (const frame of buildVoiceAsrStopFrames(
				QA_ASR_TASK_ID,
				new Uint8Array(0),
			)) {
				controller.sendJson(frame);
				if (frame.type === "asr.audio.commit" || frame.type === "asr.stop") {
					controller.appendDebug(`sent ${String(frame.type)}`);
				}
			}
		}
		controller.resetVoiceSession();
	}, [controller]);

	useEffect(() => {
		const resetHandler = () => {
			controller.resetVoiceSession({ forceTextMode: true });
		};
		window.addEventListener("agent:voice-reset", resetHandler);
		return () => {
			window.removeEventListener("agent:voice-reset", resetHandler);
			controller.resetVoiceSession();
		};
	}, [controller]);

	useEffect(() => {
		controller.readyCuePlayerRef.current.setMuted(state.audioMuted);
	}, [controller, state.audioMuted]);

	useEffect(() => {
		const voiceEligible =
			Boolean(currentWorker) &&
			currentWorker?.type === "agent" &&
			!state.activeFrontendTool;

		if (state.inputMode !== "voice") {
			if (controller.startedAgentKeyRef.current) {
				stopVoiceChatForModeExit();
			}
			return;
		}

		if (!voiceEligible || !currentWorker || currentWorker.type !== "agent") {
			stopVoiceChatForModeExit();
			dispatch({ type: "SET_INPUT_MODE", mode: "text" });
			return;
		}

		if (controller.startedAgentKeyRef.current === currentWorker.sourceId) {
			return;
		}

		void startVoiceChatForWorker();
	}, [
		controller,
		currentWorker,
		dispatch,
		startVoiceChatForWorker,
		state.activeFrontendTool,
		state.inputMode,
		stopVoiceChatForModeExit,
	]);
}
