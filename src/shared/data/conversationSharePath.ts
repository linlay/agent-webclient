const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/u;

export function buildConversationSharePath(value: unknown): string {
  const shareId = typeof value === "string" ? value.trim() : "";
  return SHARE_ID_PATTERN.test(shareId)
    ? `/share/${encodeURIComponent(shareId)}`
    : "";
}
