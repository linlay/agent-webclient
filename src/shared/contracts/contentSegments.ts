export interface ContentSegment {
  kind: "text" | "view" | "ttsVoice";
  text?: string;
  signature?: string;
  key?: string;
  view?: import("./view").ViewReference;
  payloadRaw?: string;
  payload?: unknown;
  closed?: boolean;
  startOffset?: number;
}
