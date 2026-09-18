// Upload status is checked by the composer; query always requires typed text.
export function hasSendableContent(message: unknown, references: unknown, steering = false): boolean {
  if (String(message ?? "").trim()) return true;
  return steering && Array.isArray(references) && references.some(reference => {
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) return false;
    if (reference.type === "selection") {
      return typeof reference.meta?.text === "string" && Boolean(reference.meta.text.trim());
    }
    return (!reference.type || reference.type === "file") &&
      typeof reference.url === "string" && Boolean(reference.url.trim());
  });
}
