export type InputMode = "text" | "voice";
export type VoiceChatStatus =
	| "idle"
	| "connecting"
	| "listening"
	| "thinking"
	| "speaking"
	| "error";
export type WsConnectionStatus =
	| "disconnected"
	| "connecting"
	| "connected"
	| "reconnecting"
	| "error";

import type { VoiceCapabilities } from "@/shared/data/api/dto/voice";

export interface VoiceChatState {
  status: VoiceChatStatus;
  sessionActive: boolean;
  partialUserText: string;
  partialAssistantText: string;
  error: string;
  capabilities: VoiceCapabilities | null;
  selectedVoice: string;
  mode: "auto" | "manual";
  awaiting: boolean;
  currentAgentKey: string;
  currentAgentName: string;
}

export interface VoiceState {
  wsStatus: WsConnectionStatus;
  wsErrorMessage: string;
  audioMuted: boolean;
  inputMode: InputMode;
  voiceChat: VoiceChatState;
}

export type VoiceAction =
  | { type: "SET_WS_STATUS"; status: WsConnectionStatus }
  | { type: "SET_WS_ERROR_MESSAGE"; message: string }
  | { type: "SET_AUDIO_MUTED"; muted: boolean }
  | { type: "SET_INPUT_MODE"; mode: InputMode }
  | { type: "PATCH_VOICE_CHAT"; patch: Partial<VoiceChatState> };

export function createInitialVoiceChatState(): VoiceChatState {
  return {
    status: "idle", sessionActive: false, partialUserText: "", partialAssistantText: "",
    error: "", capabilities: null, selectedVoice: "", mode: "auto", awaiting: false,
    currentAgentKey: "", currentAgentName: "",
  };
}

export function createInitialVoiceState(): VoiceState {
  return { wsStatus: "disconnected", wsErrorMessage: "", audioMuted: false, inputMode: "text", voiceChat: createInitialVoiceChatState() };
}

export function reduceVoiceState<S extends VoiceState>(state: S, action: VoiceAction): S;
export function reduceVoiceState<S extends VoiceState>(state: S, action: { type: string }): S | null;
export function reduceVoiceState<S extends VoiceState>(state: S, input: { type: string }): S | null {
  const action = input as VoiceAction;
  switch (action.type) {
    case "SET_WS_STATUS": return {
      ...state, wsStatus: action.status,
      wsErrorMessage: action.status === "connected" || action.status === "connecting" ? "" : state.wsErrorMessage,
    };
    case "SET_WS_ERROR_MESSAGE": return { ...state, wsErrorMessage: String(action.message || "") };
    case "SET_AUDIO_MUTED": return { ...state, audioMuted: action.muted };
    case "SET_INPUT_MODE": return { ...state, inputMode: action.mode };
    case "PATCH_VOICE_CHAT": return { ...state, voiceChat: { ...state.voiceChat, ...action.patch } };
    default: return null;
  }
}
