export const SELECTED_TEXT_MAX_CHARACTERS = 50_000;
export const SELECTED_TEXT_REFERENCES_ACCEPTED_EVENT =
  "agent:selected-text-references-accepted";

export type SelectedTextSourceKind = "message" | "code";

export type SelectedTextReferenceV1 = {
  id: string;
  type: "selection";
  text: string;
  annotation?: string;
  annotationIndex?: number;
  meta: {
    sourceKind: SelectedTextSourceKind;
  };
};

export type SelectedTextFragment = {
  targetId: string;
  reference: SelectedTextReferenceV1;
};

export function validAnnotationIndex(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return undefined;
  return value;
}

function createSelectionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `selection-${crypto.randomUUID()}`;
  }
  return `selection-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeSelectedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function selectedTextByteLength(text: string) {
  return typeof TextEncoder === "function"
    ? new TextEncoder().encode(text).byteLength
    : text.length;
}

export function createSelectedTextFragment(input: {
  text: string;
  targetId: string;
  sourceKind: SelectedTextSourceKind;
}): SelectedTextFragment | null {
  const text = normalizeSelectedText(input.text);
  const targetId = String(input.targetId || "").trim();
  if (!text || text.length > SELECTED_TEXT_MAX_CHARACTERS || !targetId) {
    return null;
  }
  return {
    targetId,
    reference: {
      id: createSelectionId(),
      type: "selection",
      text,
      meta: { sourceKind: input.sourceKind },
    },
  };
}

export function selectedTextFragmentIdentity(fragment: SelectedTextFragment) {
  return [
    fragment.targetId,
    fragment.reference.meta.sourceKind,
    fragment.reference.text,
  ].join("\u0000");
}

export function addSelectedTextFragment(
  current: readonly SelectedTextFragment[],
  fragment: SelectedTextFragment,
  nextIndex = 1,
) {
  const identity = selectedTextFragmentIdentity(fragment);
  if (current.some(candidate => selectedTextFragmentIdentity(candidate) === identity)) return [...current];
  const index = current.reduce((next, candidate) => Math.max(next,
    (validAnnotationIndex(candidate.reference.annotationIndex) || 0) + 1), nextIndex);
  return [...current, { ...fragment, reference: { ...fragment.reference, annotationIndex: index } }];
}

export function readSelectedText(reference: { text?: unknown }): string {
  return typeof reference.text === "string" ? reference.text : "";
}

export function updateSelectedTextAnnotation(
  fragments: readonly SelectedTextFragment[], referenceId: string, annotation: string,
): SelectedTextFragment[] {
  return fragments.map(fragment => {
    if (fragment.reference.id !== referenceId) return fragment;
    const { annotation: previous, ...reference } = fragment.reference;
    return { ...fragment, reference: { ...reference, ...(annotation.trim() ? { annotation } : {}) } };
  });
}

/**
 * A completed run starts a new numbering scope without changing reference IDs.
 * `startIndex` keeps a scope that still has restored references numbering after them.
 */
export function renumberSelectedTextFragments(
  fragments: readonly SelectedTextFragment[],
  startIndex = 1,
): SelectedTextFragment[] {
  return fragments.map((fragment, index) => ({
    ...fragment, reference: { ...fragment.reference, annotationIndex: startIndex + index },
  }));
}
