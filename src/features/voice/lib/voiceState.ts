export type InputMode = "text" | "voice";
export type VoiceChatStatus =
	| "idle"
	| "connecting"
	| "listening"
	| "thinking"
	| "speaking"
	| "error";
export type VoiceChatWsStatus =
	| "idle"
	| "connecting"
	| "open"
	| "closed"
	| "error";
export type WsConnectionStatus =
	| "disconnected"
	| "connecting"
	| "connected"
	| "reconnecting"
	| "error";

import type {
	VoiceCapabilities,
	VoiceClientGateSettings,
} from "@/shared/data/api/dto/voice";
import { resolveDefaultVoiceAsrDefaults } from "@/features/voice/lib/voiceAsrProtocol";

export type {
	VoiceCapabilities,
	VoiceClientGateSettings,
} from "@/shared/data/api/dto/voice";

export interface VoiceClientGateConfig {
	enabled: boolean;
	rmsThreshold: number;
	openHoldMs: number;
	closeHoldMs: number;
	preRollMs: number;
}

export interface VoiceOption {
	id: string;
	displayName: string;
	provider: string;
	default: boolean;
}

export interface VoiceChatState {
	status: VoiceChatStatus;
	sessionActive: boolean;
	partialUserText: string;
	partialAssistantText: string;
	activeAssistantContentId: string;
	activeRequestId: string;
	activeTtsTaskId: string;
	ttsCommitted: boolean;
	error: string;
	wsStatus: VoiceChatWsStatus;
	capabilities: VoiceCapabilities | null;
	capabilitiesLoaded: boolean;
	capabilitiesError: string;
	voices: VoiceOption[];
	voicesLoaded: boolean;
	voicesError: string;
	selectedVoice: string;
	speechRate: number;
	clientGate: VoiceClientGateConfig;
	clientGateCustomized: boolean;
	currentAgentKey: string;
	currentAgentName: string;
}

export interface VoiceState {
  wsStatus: WsConnectionStatus;
  wsErrorMessage: string;
  audioMuted: boolean;
  ttsDebugStatus: string;
  inputMode: InputMode;
  voiceChat: VoiceChatState;
}

export type VoiceAction =
  | { type: "SET_WS_STATUS"; status: WsConnectionStatus }
  | { type: "SET_WS_ERROR_MESSAGE"; message: string }
  | { type: "SET_AUDIO_MUTED"; muted: boolean }
  | { type: "SET_TTS_DEBUG_STATUS"; status: string }
  | { type: "SET_INPUT_MODE"; mode: InputMode }
  | { type: "PATCH_VOICE_CHAT"; patch: Partial<VoiceChatState> };

export function createInitialVoiceChatState(): VoiceChatState {
  return {
    status: "idle", sessionActive: false, partialUserText: "", partialAssistantText: "",
    activeAssistantContentId: "", activeRequestId: "", activeTtsTaskId: "", ttsCommitted: false,
    error: "", wsStatus: "idle", capabilities: null, capabilitiesLoaded: false, capabilitiesError: "",
    voices: [], voicesLoaded: false, voicesError: "", selectedVoice: "", speechRate: 1.2,
    clientGate: resolveDefaultVoiceAsrDefaults().clientGate, clientGateCustomized: false,
    currentAgentKey: "", currentAgentName: "",
  };
}

export function createInitialVoiceState(): VoiceState {
  return { wsStatus: "disconnected", wsErrorMessage: "", audioMuted: false, ttsDebugStatus: "idle", inputMode: "text", voiceChat: createInitialVoiceChatState() };
}

export function reduceVoiceState(state: VoiceState, action: VoiceAction): VoiceState {
  switch (action.type) {
    case "SET_WS_STATUS": return {
      ...state,
      wsStatus: action.status,
      wsErrorMessage:
        action.status === "connected" || action.status === "connecting"
          ? ""
          : state.wsErrorMessage,
    };
    case "SET_WS_ERROR_MESSAGE": return { ...state, wsErrorMessage: String(action.message || "") };
    case "SET_AUDIO_MUTED": return { ...state, audioMuted: action.muted };
    case "SET_TTS_DEBUG_STATUS": return { ...state, ttsDebugStatus: action.status };
    case "SET_INPUT_MODE": return { ...state, inputMode: action.mode };
    case "PATCH_VOICE_CHAT": return { ...state, voiceChat: { ...state.voiceChat, ...action.patch } };
  }
}
