import type { TimelineAttachment } from "@/features/timeline/lib/timelineState";
import {
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
