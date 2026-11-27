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

function selectionItemId(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  if (record.type !== "selection") return null;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  return id || null;
}

/**
 * 切回某个 Chat 时，同一条选区可能既是本地草稿，又由恢复的引用重新给出。
 * 合并时保持原有顺序，但用 `preferred`（本地草稿）里的同 id 项替换，避免编号回退。
 */
export function mergeSelectedTextFragments(
  fragments: readonly SelectedTextFragment[],
  preferred: readonly SelectedTextFragment[],
): SelectedTextFragment[] {
  const preferredById = new Map(preferred.map((fragment) => [fragment.reference.id, fragment]));
  const seen = new Set<string>();
  return fragments.flatMap((fragment) => {
    const id = fragment.reference.id;
    if (seen.has(id)) return [];
    seen.add(id);
    return [preferredById.get(id) ?? fragment];
  });
}

/** 引用/附件按原顺序合并；同一 selection id 只保留首次出现，并优先取 `preferred` 的版本。 */
export function mergeSelectionItems<T>(items: readonly T[], preferred: readonly T[]): T[] {
  const preferredById = new Map<string, T>();
  for (const item of preferred) {
    const id = selectionItemId(item);
    if (id) preferredById.set(id, item);
  }
  const seen = new Set<string>();
  return items.flatMap((item) => {
    const id = selectionItemId(item);
    if (!id) return [item];
    if (seen.has(id)) return [];
    seen.add(id);
    return [preferredById.get(id) ?? item];
  });
}
