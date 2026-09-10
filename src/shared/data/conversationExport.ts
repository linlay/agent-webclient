import { readRuntimeConfigValue } from "@/shared/config/runtimeConfig";

export const MAX_CONVERSATION_HTML_BYTES = 20 * 1024 * 1024;
export const MAX_CONVERSATION_SNAPSHOT_BYTES = 20 * 1024 * 1024;
export const MAX_CONVERSATION_TEMPLATE_BYTES = 256 * 1024;
export const CONVERSATION_EXPORT_TEMPLATE_PATH =
  "/assets/conversation-export/conversation.template.html";
export const CONVERSATION_EXPORT_SNAPSHOT_MARKER =
  "__CONVERSATION_EXPORT_SNAPSHOT_JSON_V1__";
export const CONVERSATION_EXPORT_ASSET_ORIGIN_MARKER =
  "__CONVERSATION_EXPORT_ASSET_ORIGIN__";

export function resolveConversationExportAssetOrigin(): string {
  const configured = String(
    readRuntimeConfigValue("CONVERSATION_EXPORT_ASSET_ORIGIN") || "",
  ).trim();
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("conversation_export_asset_origin_invalid");
  }
  const hostname = parsed.hostname.toLowerCase();
  const loopback =
    hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "[::1]";
  const forbiddenHostname =
    (!loopback && hostname.endsWith(".localhost"))
    || (!loopback && /^127(?:\.\d{1,3}){3}$/u.test(hostname))
    || hostname === "0.0.0.0";
  if (
    parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || forbiddenHostname
    || (parsed.pathname !== "" && parsed.pathname !== "/")
    || (parsed.protocol !== "https:"
      && !(parsed.protocol === "http:" && loopback))
  ) {
    throw new Error("conversation_export_asset_origin_invalid");
  }
  return parsed.origin;
}

export function buildConversationHtmlBlob(input: {
  template: string;
  snapshot: Blob;
  assetOrigin: string;
}): Blob {
  const templateBytes = new Blob([input.template]).size;
  if (templateBytes > MAX_CONVERSATION_TEMPLATE_BYTES) {
    throw new Error(
      `conversation_export_template_too_large: actual=${templateBytes} limit=${MAX_CONVERSATION_TEMPLATE_BYTES}`,
    );
  }
  if (input.snapshot.size > MAX_CONVERSATION_SNAPSHOT_BYTES) {
    throw conversationExportHtmlTooLargeError(input.snapshot.size);
  }

  const parts: BlobPart[] = [];
  let cursor = 0;
  let snapshotMarkers = 0;
  let assetOriginMarkers = 0;
  while (cursor < input.template.length) {
    const snapshotIndex = input.template.indexOf(
      CONVERSATION_EXPORT_SNAPSHOT_MARKER,
      cursor,
    );
    const assetOriginIndex = input.template.indexOf(
      CONVERSATION_EXPORT_ASSET_ORIGIN_MARKER,
      cursor,
    );
    if (snapshotIndex < 0 && assetOriginIndex < 0) break;

    const useSnapshot = snapshotIndex >= 0
      && (assetOriginIndex < 0 || snapshotIndex < assetOriginIndex);
    const markerIndex = useSnapshot ? snapshotIndex : assetOriginIndex;
    parts.push(input.template.slice(cursor, markerIndex));
    if (useSnapshot) {
      snapshotMarkers += 1;
      parts.push(input.snapshot);
      cursor = markerIndex + CONVERSATION_EXPORT_SNAPSHOT_MARKER.length;
    } else {
      assetOriginMarkers += 1;
      parts.push(input.assetOrigin);
      cursor = markerIndex + CONVERSATION_EXPORT_ASSET_ORIGIN_MARKER.length;
    }
  }
  parts.push(input.template.slice(cursor));

  if (snapshotMarkers !== 1 || assetOriginMarkers < 1) {
    throw new Error("conversation_export_template_invalid");
  }
  const html = new Blob(parts, { type: "text/html;charset=utf-8" });
  if (html.size > MAX_CONVERSATION_HTML_BYTES) {
    throw conversationExportHtmlTooLargeError(html.size);
  }
  return html;
}

export function conversationHtmlFilename(
  snapshotFilename: string,
  chatId: string,
): string {
  const normalized = snapshotFilename.trim();
  if (/\.snapshot\.json$/iu.test(normalized)) {
    return normalized.replace(/\.snapshot\.json$/iu, ".html");
  }
  return `${chatId.trim() || "conversation"}.html`;
}

export function conversationExportHtmlTooLargeError(actualBytes: number): Error {
  return new Error(
    `conversation_export_html_too_large: actual=${actualBytes} limit=${MAX_CONVERSATION_HTML_BYTES} (20 MiB)`,
  );
}
