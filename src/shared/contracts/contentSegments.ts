export interface ContentSegment {
  kind: "text" | "viewport" | "ttsVoice";
  text?: string;
  signature?: string;
  key?: string;
  payloadRaw?: string;
  payload?: unknown;
  closed?: boolean;
  startOffset?: number;
}
