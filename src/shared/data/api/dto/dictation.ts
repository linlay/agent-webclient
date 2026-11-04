export interface DictationCapabilities {
  enabled: boolean;
  reason: string;
  version: 1;
  websocketPath: string;
  maxRecordingSeconds: 60;
  input: { codec: "pcm_s16le"; sampleRate: 16000; channels: 1; frameMs: 20 };
}
