export interface VoiceClientGateSettings {
  enabled?: boolean;
  rmsThreshold?: number;
  openHoldMs?: number;
  closeHoldMs?: number;
  preRollMs?: number;
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
