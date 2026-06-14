import { useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import type { AppState } from "@/app/state/types";
import { ReadyCuePlayer } from "@/features/voice/lib/voiceChatAudio";
import {
	createVoiceAudioCaptureState,
	type VoiceAudioCaptureState,
} from "@/features/voice/lib/voiceAudioCapture";

export interface VoiceChatRuntimeRefs {
	socketRef: MutableRefObject<WebSocket | null>;
	socketPromiseRef: MutableRefObject<Promise<WebSocket> | null>;
	expectedCloseRef: MutableRefObject<boolean>;
	startedAgentKeyRef: MutableRefObject<string>;
	pendingUtteranceRef: MutableRefObject<string>;
	flushTimerRef: MutableRefObject<number | null>;
	capturePausedRef: MutableRefObject<boolean>;
	turnCounterRef: MutableRefObject<number>;
	readyCuePlayerRef: MutableRefObject<ReadyCuePlayer>;
	audioCaptureStateRef: MutableRefObject<VoiceAudioCaptureState>;
	asrChunkCounterRef: MutableRefObject<number>;
	listeningTransitionRef: MutableRefObject<number>;
	reconnectTimerRef: MutableRefObject<number | null>;
	reconnectAttemptRef: MutableRefObject<number>;
	reconnectInFlightRef: MutableRefObject<boolean>;
	asrTaskActiveRef: MutableRefObject<boolean>;
	asrStartInFlightRef: MutableRefObject<boolean>;
	asrRestartPendingRef: MutableRefObject<boolean>;
	ttsTaskActiveRef: MutableRefObject<boolean>;
	bargeInProgressRef: MutableRefObject<boolean>;
	clientGateConfigRef: MutableRefObject<AppState["voiceChat"]["clientGate"]>;
	scheduleVoiceReconnectRef: MutableRefObject<(reason: string) => void>;
}

export function useVoiceChatRuntimeRefs(state: AppState): VoiceChatRuntimeRefs {
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

	return useMemo(
		() => ({
			socketRef,
			socketPromiseRef,
			expectedCloseRef,
			startedAgentKeyRef,
			pendingUtteranceRef,
			flushTimerRef,
			capturePausedRef,
			turnCounterRef,
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
		}),
		[
			asrChunkCounterRef,
			asrRestartPendingRef,
			asrStartInFlightRef,
			asrTaskActiveRef,
			audioCaptureStateRef,
			bargeInProgressRef,
			capturePausedRef,
			clientGateConfigRef,
			expectedCloseRef,
			flushTimerRef,
			listeningTransitionRef,
			pendingUtteranceRef,
			readyCuePlayerRef,
			reconnectAttemptRef,
			reconnectInFlightRef,
			reconnectTimerRef,
			scheduleVoiceReconnectRef,
			socketPromiseRef,
			socketRef,
			startedAgentKeyRef,
			ttsTaskActiveRef,
			turnCounterRef,
		],
	);
}
