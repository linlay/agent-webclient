import { useCallback, useMemo, useRef } from "react";
import type { Dispatch, MutableRefObject } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { AppState, VoiceCapabilities } from "@/app/state/types";
import {
	ensureAccessToken,
	getVoiceCapabilitiesFlexible,
	getVoiceVoicesFlexible,
} from "@/shared/api/apiClient";
import { isAppMode } from "@/shared/utils/routing";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { ReadyCuePlayer } from "@/features/voice/lib/voiceChatAudio";
import {
	cleanupVoiceAudioCapture,
	createVoiceAudioCaptureState,
	type VoiceAudioCaptureState,
} from "@/features/voice/lib/voiceAudioCapture";
import { resolveVoiceAsrRuntimeConfig } from "@/features/voice/lib/voiceAsrProtocol";
import {
	ensureVoiceOptions,
	resolveDefaultVoice,
} from "@/features/voice/lib/voiceChatRuntimeUtils";
import { getVoiceRuntime } from "@/features/voice/lib/voiceRuntime";
import { t } from "@/shared/i18n";

export type VoiceChatRuntimeController = ReturnType<
	typeof useVoiceChatRuntimeController
>;

export function useVoiceChatRuntimeController({
	dispatch,
	state,
	stateRef,
}: {
	dispatch: Dispatch<AppAction>;
	state: AppState;
	stateRef: MutableRefObject<AppState>;
}) {
	const socketRef = useRef<WebSocket | null>(null);
	const socketPromiseRef = useRef<Promise<WebSocket> | null>(null);
	const expectedCloseRef = useRef(false);
	const startedAgentKeyRef = useRef("");
	const pendingUtteranceRef = useRef("");
	const flushTimerRef = useRef<number | null>(null);
	const capturePausedRef = useRef(false);
	const turnCounterRef = useRef(0);
	const readyCuePlayerRef = useRef(new ReadyCuePlayer());
	const audioCaptureStateRef = useRef<VoiceAudioCaptureState>(
		createVoiceAudioCaptureState(),
	);
	const asrChunkCounterRef = useRef(0);
	const listeningTransitionRef = useRef(0);
	const reconnectTimerRef = useRef<number | null>(null);
	const reconnectAttemptRef = useRef(0);
	const reconnectInFlightRef = useRef(false);
	const asrTaskActiveRef = useRef(false);
	const asrStartInFlightRef = useRef(false);
	const asrRestartPendingRef = useRef(false);
	const ttsTaskActiveRef = useRef(false);
	const bargeInProgressRef = useRef(false);
	const clientGateConfigRef = useRef(state.voiceChat.clientGate);
	const scheduleVoiceReconnectRef = useRef<(reason: string) => void>(
		() => undefined,
	);

	const appendDebug = useCallback(
		(line: string) => {
			dispatch({ type: "APPEND_DEBUG", line: `[voice-chat] ${line}` });
		},
		[dispatch],
	);

	const patchVoiceChat = useCallback(
		(patch: Partial<AppState["voiceChat"]>) => {
			dispatch({ type: "PATCH_VOICE_CHAT", patch });
		},
		[dispatch],
	);

	const clearFlushTimer = useCallback(() => {
		if (flushTimerRef.current != null) {
			window.clearTimeout(flushTimerRef.current);
			flushTimerRef.current = null;
		}
	}, []);

	const clearReconnectTimer = useCallback(() => {
		if (reconnectTimerRef.current != null) {
			window.clearTimeout(reconnectTimerRef.current);
			reconnectTimerRef.current = null;
		}
	}, []);

	const cancelListeningTransition = useCallback(() => {
		listeningTransitionRef.current += 1;
	}, []);

	const stopSocket = useCallback(() => {
		socketPromiseRef.current = null;
		const socket = socketRef.current;
		if (!socket) return;
		expectedCloseRef.current = true;
		try {
			if (
				socket.readyState === WebSocket.OPEN ||
				socket.readyState === WebSocket.CONNECTING
			) {
				socket.close(1000, "voice chat reset");
			}
		} catch {
			/* no-op */
		}
		socketRef.current = null;
	}, []);

	const isVoiceRecoveryEligible = useCallback(() => {
		const worker = resolveCurrentWorkerSummary(stateRef.current);
		return (
			stateRef.current.inputMode === "voice" &&
			worker?.type === "agent" &&
			!stateRef.current.activeFrontendTool
		);
	}, [stateRef]);

	const sendJson = useCallback((payload: Record<string, unknown>) => {
		const socket = socketRef.current;
		if (socket == null || socket.readyState !== WebSocket.OPEN) {
			return false;
		}
		socket.send(JSON.stringify(payload));
		return true;
	}, []);

	const resolveCurrentAsrRuntime = useCallback(
		(capabilities?: VoiceCapabilities | null) =>
			resolveVoiceAsrRuntimeConfig(
				capabilities ?? stateRef.current.voiceChat.capabilities,
				stateRef.current.voiceChat.clientGate,
				stateRef.current.voiceChat.clientGateCustomized,
			),
		[stateRef],
	);

	const createTurnNodes = useCallback(
		(userText: string) => {
			const suffix = `${Date.now()}_${turnCounterRef.current++}`;
			const userNodeId = `voice_user_${suffix}`;
			const now = Date.now();

			dispatch({
				type: "SET_TIMELINE_NODE",
				id: userNodeId,
				node: {
					id: userNodeId,
					kind: "message",
					role: "user",
					text: userText,
					ts: now,
				},
			});
			dispatch({ type: "APPEND_TIMELINE_ORDER", id: userNodeId });
		},
		[dispatch],
	);

	const resetVoiceSession = useCallback(
		(options: {
			keepCapabilities?: boolean;
			keepVoices?: boolean;
			forceTextMode?: boolean;
		} = {}) => {
			clearFlushTimer();
			clearReconnectTimer();
			cancelListeningTransition();
			pendingUtteranceRef.current = "";
			startedAgentKeyRef.current = "";
			capturePausedRef.current = false;
			reconnectAttemptRef.current = 0;
			reconnectInFlightRef.current = false;
			asrTaskActiveRef.current = false;
			asrStartInFlightRef.current = false;
			asrRestartPendingRef.current = false;
			ttsTaskActiveRef.current = false;
			bargeInProgressRef.current = false;
			const activeAssistantContentId = String(
				stateRef.current.voiceChat.activeAssistantContentId || "",
			).trim();
			if (activeAssistantContentId) {
				getVoiceRuntime()?.stopVoiceChatSession(activeAssistantContentId);
			}
			readyCuePlayerRef.current.stop();
			cleanupVoiceAudioCapture(audioCaptureStateRef.current);
			stopSocket();
			asrChunkCounterRef.current = 0;
			patchVoiceChat({
				status: "idle",
				sessionActive: false,
				partialUserText: "",
				partialAssistantText: "",
				activeAssistantContentId: "",
				activeRequestId: "",
				activeTtsTaskId: "",
				ttsCommitted: false,
				error: "",
				wsStatus: "idle",
				currentAgentKey: "",
				currentAgentName: "",
				capabilities:
					options.keepCapabilities === false
						? null
						: stateRef.current.voiceChat.capabilities,
				capabilitiesLoaded:
					options.keepCapabilities === false
						? false
						: stateRef.current.voiceChat.capabilitiesLoaded,
				capabilitiesError:
					options.keepCapabilities === false
						? ""
						: stateRef.current.voiceChat.capabilitiesError,
				voices:
					options.keepVoices === false ? [] : stateRef.current.voiceChat.voices,
				voicesLoaded:
					options.keepVoices === false
						? false
						: stateRef.current.voiceChat.voicesLoaded,
				voicesError:
					options.keepVoices === false
						? ""
						: stateRef.current.voiceChat.voicesError,
				selectedVoice:
					options.keepVoices === false
						? ""
						: stateRef.current.voiceChat.selectedVoice,
			});
			if (options.forceTextMode) {
				dispatch({ type: "SET_INPUT_MODE", mode: "text" });
			}
		},
		[
			cancelListeningTransition,
			clearFlushTimer,
			clearReconnectTimer,
			dispatch,
			patchVoiceChat,
			stateRef,
			stopSocket,
		],
	);

	const handleFatalError = useCallback(
		(message: string) => {
			appendDebug(message);
			clearReconnectTimer();
			cancelListeningTransition();
			reconnectAttemptRef.current = 0;
			reconnectInFlightRef.current = false;
			asrTaskActiveRef.current = false;
			asrStartInFlightRef.current = false;
			asrRestartPendingRef.current = false;
			ttsTaskActiveRef.current = false;
			patchVoiceChat({
				status: "error",
				error: message,
				sessionActive: false,
				wsStatus: socketRef.current
					? stateRef.current.voiceChat.wsStatus
					: "error",
				activeAssistantContentId: "",
				activeRequestId: "",
				activeTtsTaskId: "",
				ttsCommitted: false,
			});
			const activeAssistantContentId = String(
				stateRef.current.voiceChat.activeAssistantContentId || "",
			).trim();
			if (activeAssistantContentId) {
				getVoiceRuntime()?.stopVoiceChatSession(activeAssistantContentId);
			}
			cleanupVoiceAudioCapture(audioCaptureStateRef.current);
			stopSocket();
			startedAgentKeyRef.current = "";
			asrChunkCounterRef.current = 0;
		},
		[
			appendDebug,
			cancelListeningTransition,
			clearReconnectTimer,
			patchVoiceChat,
			stateRef,
			stopSocket,
		],
	);

	const ensureVoiceSetup = useCallback(async () => {
		let capabilities = stateRef.current.voiceChat.capabilities;
		let voices = stateRef.current.voiceChat.voices;
		let selectedVoice = stateRef.current.voiceChat.selectedVoice;

		if (!stateRef.current.voiceChat.capabilitiesLoaded) {
			try {
				capabilities = await getVoiceCapabilitiesFlexible();
				const runtimeConfig = resolveCurrentAsrRuntime(capabilities);
				patchVoiceChat({
					capabilities,
					capabilitiesLoaded: true,
					capabilitiesError: "",
					speechRate:
						Number(capabilities?.tts?.speechRateDefault) ||
						stateRef.current.voiceChat.speechRate,
					clientGate: stateRef.current.voiceChat.clientGateCustomized
						? stateRef.current.voiceChat.clientGate
						: runtimeConfig.asrDefaults.clientGate,
				});
			} catch (error) {
				const message = (error as Error).message;
				patchVoiceChat({
					capabilitiesLoaded: false,
					capabilitiesError: message,
				});
				throw error;
			}
		}

		if (!stateRef.current.voiceChat.voicesLoaded) {
			try {
				const voicesPath =
					String(capabilities?.tts?.voicesEndpoint || "").trim() ||
					"/api/voice/tts/voices";
				const response = await getVoiceVoicesFlexible(voicesPath);
				voices = ensureVoiceOptions(response);
				selectedVoice = resolveDefaultVoice(
					voices,
					stateRef.current.voiceChat.selectedVoice,
					response?.defaultVoice,
				);
				patchVoiceChat({
					voices,
					voicesLoaded: true,
					voicesError: "",
					selectedVoice,
				});
			} catch (error) {
				const rawMessage = (error as Error).message;
				const message =
					rawMessage === "Response is not ApiResponse shape" ||
					rawMessage === "voice voices response is invalid"
						? t("voice.chat.error.invalidVoicesResponse")
						: rawMessage;
				patchVoiceChat({
					voicesLoaded: false,
					voicesError: message,
				});
				throw error;
			}
		}

		return {
			capabilities: capabilities || stateRef.current.voiceChat.capabilities,
			voices: voices || stateRef.current.voiceChat.voices,
			selectedVoice: selectedVoice || stateRef.current.voiceChat.selectedVoice,
		};
	}, [patchVoiceChat, resolveCurrentAsrRuntime, stateRef]);

	const ensureVoiceAccessToken = useCallback(async () => {
		const token = isAppMode()
			? await ensureAccessToken("missing")
			: String(stateRef.current.accessToken || "").trim();
		if (token !== String(stateRef.current.accessToken || "").trim()) {
			dispatch({ type: "SET_ACCESS_TOKEN", token });
		}
		return token;
	}, [dispatch, stateRef]);

	return useMemo(() => ({
		dispatch,
		stateRef,
		socketRef,
		socketPromiseRef,
		expectedCloseRef,
		startedAgentKeyRef,
		pendingUtteranceRef,
		flushTimerRef,
		capturePausedRef,
		readyCuePlayerRef,
		audioCaptureStateRef,
		asrChunkCounterRef,
		listeningTransitionRef,
		reconnectTimerRef,
		reconnectAttemptRef,
		reconnectInFlightRef,
		asrTaskActiveRef,
		asrStartInFlightRef,
		asrRestartPendingRef,
		ttsTaskActiveRef,
		bargeInProgressRef,
		clientGateConfigRef,
		scheduleVoiceReconnectRef,
		appendDebug,
		patchVoiceChat,
		clearFlushTimer,
		clearReconnectTimer,
		cancelListeningTransition,
		stopSocket,
		isVoiceRecoveryEligible,
		sendJson,
		resolveCurrentAsrRuntime,
		createTurnNodes,
		resetVoiceSession,
		handleFatalError,
		ensureVoiceSetup,
		ensureVoiceAccessToken,
	}), [
		appendDebug,
		cancelListeningTransition,
		clearFlushTimer,
		clearReconnectTimer,
		createTurnNodes,
		dispatch,
		ensureVoiceAccessToken,
		ensureVoiceSetup,
		handleFatalError,
		isVoiceRecoveryEligible,
		patchVoiceChat,
		resetVoiceSession,
		resolveCurrentAsrRuntime,
		sendJson,
		stateRef,
		stopSocket,
	]);
}
