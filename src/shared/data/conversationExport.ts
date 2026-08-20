import { readRuntimeConfigValue } from "@/shared/config/runtimeConfig";

export const MAX_CONVERSATION_HTML_BYTES = 20 * 1024 * 1024;
export const CONVERSATION_EXPORT_ASSET_ORIGIN_HEADER =
  "X-Conversation-Export-Asset-Origin";

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
  if (
    parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || (parsed.pathname !== "" && parsed.pathname !== "/")
    || (parsed.protocol !== "https:"
      && !(parsed.protocol === "http:" && loopback))
  ) {
    throw new Error("conversation_export_asset_origin_invalid");
  }
  return parsed.origin;
}
