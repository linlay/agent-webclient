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
	| "error";

export interface VoiceClientGateSettings {
	enabled?: boolean;
	rmsThreshold?: number;
	openHoldMs?: number;
	closeHoldMs?: number;
	preRollMs?: number;
}

export interface VoiceClientGateConfig {
	enabled: boolean;
	rmsThreshold: number;
	openHoldMs: number;
	closeHoldMs: number;
	preRollMs: number;
}

export interface VoiceCapabilities {
	websocketPath?: string;
	asr?: {
		configured?: boolean;
		defaults?: {
			sampleRate?: number;
			language?: string;
			clientGate?: VoiceClientGateSettings;
			turnDetection?: {
				type?: string;
				threshold?: number;
				silenceDurationMs?: number;
			};
		};
	};
	tts?: {
		modes?: string[];
		deprecatedModes?: string[];
		defaultMode?: "local" | "llm";
		streamInput?: boolean;
		runnerConfigured?: boolean;
		speechRateDefault?: number;
		audioFormat?: {
			sampleRate?: number;
			channels?: number;
			responseFormat?: string;
		};
		voicesEndpoint?: string;
	};
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
