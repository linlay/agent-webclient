// Upload status is checked by the composer; only resolved file references count.
export function hasSendableContent(message: unknown, references: unknown, steering = false): boolean {
  if (String(message ?? "").trim()) return true;
  return steering && Array.isArray(references) && references.some(reference =>
    reference != null && typeof reference === "object" &&
    (!reference.type || reference.type === "file") &&
    typeof reference.url === "string" && Boolean(reference.url.trim()),
  );
}
