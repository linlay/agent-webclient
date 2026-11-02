export interface VoiceCapabilities {
  enabled: boolean;
  reason: string;
  version: 1;
  websocketPath: string;
  input: { codecs: string[]; sampleRate: 16000; channels: 1 };
  output: { codecs: string[]; sampleRates: (16000 | 24000)[] };
  voices: { id: string; label: string }[];
  defaultVoice: string;
}
