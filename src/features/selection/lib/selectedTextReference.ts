import type { TimelineAttachment } from "@/features/timeline/lib/timelineState";
import {
  SELECTED_TEXT_REFERENCES_ACCEPTED_EVENT,
  normalizeSelectedText,
  selectedTextByteLength,
  type SelectedTextFragment,
} from "@/shared/contracts/selectedTextReference";

export * from "@/shared/contracts/selectedTextReference";

export function selectedTextReferenceToAttachment(
  fragment: SelectedTextFragment,
): TimelineAttachment {
  const { reference } = fragment;
  return {
    id: reference.id,
    name: reference.name,
    size: reference.sizeBytes,
    type: reference.type,
    mimeType: reference.mimeType,
    meta: { ...reference.meta },
  };
}

export function selectedTextFragmentFromAttachment(
  attachment: TimelineAttachment,
): SelectedTextFragment | null {
  const meta = attachment.meta;
  const text = normalizeSelectedText(meta?.text);
  const sourceKind = meta?.sourceKind;
  const id = String(attachment.id || "").trim();
  if (
    attachment.type !== "selection" ||
    !id ||
    !text ||
    (sourceKind !== "message" && sourceKind !== "code")
  ) return null;
  return {
    targetId: id,
    reference: {
      id,
      type: "selection",
      name: String(attachment.name || "Selected text").trim() || "Selected text",
      mimeType: "text/plain",
      sizeBytes: Number.isFinite(attachment.size) ? Number(attachment.size) : selectedTextByteLength(text),
      meta: { text, sourceKind },
    },
  };
}

export function notifySelectedTextReferencesAccepted(references: unknown[]) {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function" ||
    typeof CustomEvent === "undefined"
  ) return;
  const referenceIds = getAcceptedSelectedTextReferenceIds(references);
  if (referenceIds.length === 0) return;
  window.dispatchEvent(new CustomEvent(SELECTED_TEXT_REFERENCES_ACCEPTED_EVENT, {
    detail: { referenceIds },
  }));
}

export function getAcceptedSelectedTextReferenceIds(references: unknown[]) {
  return references.flatMap((reference) => {
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) return [];
    const record = reference as Record<string, unknown>;
    return record.type === "selection" && typeof record.id === "string" && record.id.trim()
      ? [record.id.trim()]
      : [];
  });
}

export function hasSelectedTextReference(references: unknown): boolean {
  return Array.isArray(references) && references.some((reference) =>
    reference != null && typeof reference === "object" && reference.type === "selection",
  );
}
