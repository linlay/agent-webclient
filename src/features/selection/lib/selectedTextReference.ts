import type { TimelineAttachment } from "@/features/timeline/lib/timelineState";
import {
  SELECTED_TEXT_REFERENCES_ACCEPTED_EVENT,
  normalizeSelectedText,
  readSelectedText,
  validAnnotationIndex,
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
    name: reference.meta.sourceKind === "code" ? "Selected code" : "Selected text",
    size: selectedTextByteLength(reference.text),
    type: reference.type,
    text: reference.text,
    annotation: reference.annotation,
    annotationIndex: reference.annotationIndex,
    meta: { ...reference.meta },
  };
}

export function selectedTextFragmentFromAttachment(
  attachment: TimelineAttachment,
): SelectedTextFragment | null {
  const meta = attachment.meta;
  const text = normalizeSelectedText(readSelectedText(attachment));
  const sourceKind = meta?.sourceKind === "code" ? "code" : "message";
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
      text,
      ...(validAnnotationIndex(attachment.annotationIndex) ? { annotationIndex: attachment.annotationIndex } : {}),
      ...(attachment.annotation ? { annotation: attachment.annotation } : {}),
      meta: { sourceKind },
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
