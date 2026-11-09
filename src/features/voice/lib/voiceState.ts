export type InputMode = "text" | "voice";
export type VoiceInterruptionMode = "button" | "duplex";
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
import { defaultVoiceShortcut, type VoiceShortcut } from "./voiceShortcut";

export interface VoiceChatState {
  status: VoiceChatStatus;
  sessionActive: boolean;
  partialUserText: string;
  partialAssistantText: string;
  error: string;
  capabilities: VoiceCapabilities | null;
  selectedVoice: string;
  interruptionMode: VoiceInterruptionMode;
  duplexStatus: "off" | "loading" | "ready" | "error";
  duplexError: string;
  awaiting: boolean;
  canAnswerQuestion: boolean;
  supplementAccepted: boolean;
  currentAgentKey: string;
  currentAgentName: string;
}

export interface VoiceState {
  voiceShortcut: VoiceShortcut | null;
  voiceShortcutError: string;
  wsStatus: WsConnectionStatus;
  wsErrorMessage: string;
  audioMuted: boolean;
  inputMode: InputMode;
  voiceChat: VoiceChatState;
}

export type VoiceAction =
  | { type: "SET_VOICE_SHORTCUT"; shortcut: VoiceShortcut | null; error?: string }
  | { type: "SET_WS_STATUS"; status: WsConnectionStatus }
  | { type: "SET_WS_ERROR_MESSAGE"; message: string }
  | { type: "SET_AUDIO_MUTED"; muted: boolean }
  | { type: "SET_INPUT_MODE"; mode: InputMode }
  | { type: "PATCH_VOICE_CHAT"; patch: Partial<VoiceChatState> };

export function createInitialVoiceChatState(): VoiceChatState {
  return {
    status: "idle", sessionActive: false, partialUserText: "", partialAssistantText: "",
    error: "", capabilities: null, selectedVoice: "", awaiting: false, canAnswerQuestion: false, supplementAccepted: false,
    interruptionMode: "button", duplexStatus: "off", duplexError: "",
    currentAgentKey: "", currentAgentName: "",
  };
}

export function createInitialVoiceState(): VoiceState {
  return { voiceShortcut: defaultVoiceShortcut(), voiceShortcutError: "", wsStatus: "disconnected", wsErrorMessage: "", audioMuted: false, inputMode: "text", voiceChat: createInitialVoiceChatState() };
}

export function canStartVoiceChat(voice: VoiceChatState, running: boolean, awaiting: boolean): boolean {
  return voice.capabilities?.enabled === true && !running && !awaiting;
}

export function reduceVoiceState<S extends VoiceState>(state: S, action: VoiceAction): S;
export function reduceVoiceState<S extends VoiceState>(state: S, action: { type: string }): S | null;
export function reduceVoiceState<S extends VoiceState>(state: S, input: { type: string }): S | null {
  const action = input as VoiceAction;
  switch (action.type) {
    case "SET_VOICE_SHORTCUT": return { ...state, voiceShortcut: action.shortcut, voiceShortcutError: action.error || "" };
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
