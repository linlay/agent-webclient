export const PASTED_TEXT_MIN_CHARACTERS = 2000;
export const PASTED_TEXT_MIN_LINES = 20;

export interface PastedText {
  id: string;
  text: string;
  /** Position in the visible input. Text at the same position keeps paste order. */
  offset: number;
}

export interface PastedTextDraft {
  input: string;
  pastes: PastedText[];
}

export function shouldCollapsePastedText(text: string): boolean {
  if (!text.trim()) return false;
  return text.length >= PASTED_TEXT_MIN_CHARACTERS ||
    text.split(/\r\n|\r|\n/).length >= PASTED_TEXT_MIN_LINES;
}

/** The controlled composer value always contains the complete, unmodified text. */
export function serializePastedTextDraft(draft: PastedTextDraft): string {
  const parts: string[] = [];
  let position = 0;
  for (const paste of draft.pastes) {
    parts.push(draft.input.slice(position, paste.offset), paste.text);
    position = paste.offset;
  }
  parts.push(draft.input.slice(position));
  return parts.join("");
}

function replaceVisibleRange(draft: PastedTextDraft, start: number, end: number, text: string): PastedTextDraft {
  const delta = text.length - (end - start);
  return {
    input: draft.input.slice(0, start) + text + draft.input.slice(end),
    pastes: draft.pastes.map(paste => ({
      ...paste,
      // Cards stay present when the user edits or selects the surrounding text.
      offset: paste.offset <= start ? paste.offset : paste.offset < end ? start : paste.offset + delta,
    })),
  };
}

export function updatePastedTextInput(draft: PastedTextDraft, input: string, selection?: { start: number; end: number }, caret?: number): PastedTextDraft {
  if (selection) {
    const insertedLength = input.length - (draft.input.length - (selection.end - selection.start));
    const nextEnd = selection.start + insertedLength;
    if (insertedLength >= 0 && draft.input.slice(0, selection.start) === input.slice(0, selection.start) &&
      draft.input.slice(selection.end) === input.slice(nextEnd)) {
      return replaceVisibleRange(draft, selection.start, selection.end, input.slice(selection.start, nextEnd));
    }
  }
  // The post-edit caret disambiguates repeated text for native deletions and IME.
  let end = draft.input.length;
  let nextEnd = input.length;
  const previousCaret = caret === undefined ? -1 : caret + draft.input.length - input.length;
  if (caret !== undefined && previousCaret >= 0 && previousCaret <= draft.input.length &&
    draft.input.slice(previousCaret) === input.slice(caret)) {
    end = previousCaret;
    nextEnd = caret;
  }
  let start = 0;
  while (start < end && start < nextEnd && draft.input[start] === input[start]) start += 1;
  while (end > start && nextEnd > start && draft.input[end - 1] === input[nextEnd - 1]) {
    end -= 1;
    nextEnd -= 1;
  }
  return replaceVisibleRange(draft, start, end, input.slice(start, nextEnd));
}

export function insertPastedText(draft: PastedTextDraft, paste: Pick<PastedText, "id" | "text">, start: number, end: number): PastedTextDraft {
  const next = replaceVisibleRange(draft, start, end, "");
  return { ...next, pastes: [...next.pastes, { ...paste, offset: start }].sort((a, b) => a.offset - b.offset) };
}

export function removePastedText(draft: PastedTextDraft, id: string): PastedTextDraft {
  return { ...draft, pastes: draft.pastes.filter(paste => paste.id !== id) };
}

export function expandPastedText(draft: PastedTextDraft, id: string): PastedTextDraft {
  const index = draft.pastes.findIndex(paste => paste.id === id);
  if (index < 0) return draft;
  const target = draft.pastes[index];
  return {
    input: draft.input.slice(0, target.offset) + target.text + draft.input.slice(target.offset),
    pastes: draft.pastes.flatMap((paste, pasteIndex) => pasteIndex === index ? [] : [{
      ...paste,
      offset: paste.offset > target.offset || (paste.offset === target.offset && pasteIndex > index)
        ? paste.offset + target.text.length : paste.offset,
    }]),
  };
}
