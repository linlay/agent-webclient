export const SELECTED_TEXT_MAX_CHARACTERS = 50_000;
export const SELECTED_TEXT_REFERENCES_ACCEPTED_EVENT =
  "agent:selected-text-references-accepted";

export type SelectedTextSourceKind = "message" | "code";

export type SelectedTextReferenceV1 = {
  id: string;
  type: "selection";
  name: string;
  mimeType: "text/plain";
  sizeBytes: number;
  meta: {
    text: string;
    sourceKind: SelectedTextSourceKind;
  };
};

export type SelectedTextFragment = {
  targetId: string;
  reference: SelectedTextReferenceV1;
};

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
      name: input.sourceKind === "code" ? "Selected code" : "Selected text",
      mimeType: "text/plain",
      sizeBytes: selectedTextByteLength(text),
      meta: { text, sourceKind: input.sourceKind },
    },
  };
}

export function selectedTextFragmentIdentity(fragment: SelectedTextFragment) {
  return [
    fragment.targetId,
    fragment.reference.meta.sourceKind,
    fragment.reference.meta.text,
  ].join("\u0000");
}

export function addSelectedTextFragment(
  current: readonly SelectedTextFragment[],
  fragment: SelectedTextFragment,
) {
  const identity = selectedTextFragmentIdentity(fragment);
  return current.some((candidate) => selectedTextFragmentIdentity(candidate) === identity)
    ? [...current]
    : [...current, fragment];
}
