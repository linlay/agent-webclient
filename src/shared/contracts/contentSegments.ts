export interface ContentSegment {
  kind: "text" | "view" | "ttsVoice";
  text?: string;
  signature?: string;
  /** VIEW: `<connectorId>/<viewKey>` when the fence header is valid. */
  key?: string;
  /** VIEW: order among closed VIEW fences of this content; matches the platform binding. */
  index?: number;
  /** VIEW: the trimmed JSON body. */
  payloadRaw?: string;
  /** VIEW: local grammar check; the platform binding remains authoritative. */
  error?: "invalid_view" | "view_data_invalid";
  closed?: boolean;
  startOffset?: number;
}

/** Platform binding of one Markdown VIEW block (content.view / content.snapshot.views). */
export interface ContentViewBinding {
  index: number;
  view?: import("./view").ViewReference;
  viewError?: string;
}
