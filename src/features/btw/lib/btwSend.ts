export function resolveBTWSendMessage(
  draft: string,
  selectionCount: number,
  selectionOnlyPrompt: string,
): string {
  const message = String(draft || "").trim();
  if (message) return message;
  return selectionCount > 0 ? String(selectionOnlyPrompt || "").trim() : "";
}
