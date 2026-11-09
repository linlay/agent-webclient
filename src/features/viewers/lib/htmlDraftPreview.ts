import { AGENT_WEBCLIENT_HTML_DRAFT_MAX_BYTES, type WorkPanelHtmlDraftSource } from "@/shared/contracts/generated/agentWebclientBridge";

export async function buildHtmlDraftPreview(html: string, context: { agentKey: string; chatId: string }): Promise<
  { ok: true; source: WorkPanelHtmlDraftSource } | { ok: false; reason: "invalid-context" | "too-large" | "hash-unavailable" }
> {
  if (!context.agentKey.trim() || !context.chatId.trim() || !html.trim()) return { ok: false, reason: "invalid-context" };
  const bytes = new TextEncoder().encode(html);
  if (bytes.byteLength > AGENT_WEBCLIENT_HTML_DRAFT_MAX_BYTES) return { ok: false, reason: "too-large" };
  if (!globalThis.crypto?.subtle) return { ok: false, reason: "hash-unavailable" };
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  return { ok: true, source: { kind: "html-draft", agentKey: context.agentKey.trim(), chatId: context.chatId.trim(),
    name: `code-preview-${sha256.slice(0, 12)}.html`, sha256, html } };
}
