import {
  expandPastedText,
  insertPastedText,
  removePastedText,
  serializePastedTextDraft,
  shouldCollapsePastedText,
  updatePastedTextInput,
  type PastedTextDraft,
} from "./pastedText";

const firstText = "第一段材料\r\n  保留缩进\t与空格  ";
const secondText = "second material\nwith another line";
const thirdText = "第三段 🐱";

function plainDraft(input: string): PastedTextDraft {
  return { input, pastes: [] };
}

describe("long pasted text thresholds", () => {
  it("keeps short text inline and folds text from 2,000 characters", () => {
    expect(shouldCollapsePastedText("字".repeat(1999))).toBe(false);
    expect(shouldCollapsePastedText("字".repeat(2000))).toBe(true);
  });

  it.each(["\n", "\r\n", "\r"])("folds twenty logical lines with %j line endings", newline => {
    expect(shouldCollapsePastedText(Array(19).fill("line").join(newline))).toBe(false);
    expect(shouldCollapsePastedText(Array(20).fill("line").join(newline))).toBe(true);
  });

  it("counts mixed line endings without counting CRLF twice", () => {
    const nineteenLines = Array.from({ length: 19 }, (_, index) => `line ${index}`)
      .map((line, index) => index ? `${index % 2 ? "\r\n" : "\n"}${line}` : line)
      .join("");
    expect(shouldCollapsePastedText(nineteenLines)).toBe(false);
    expect(shouldCollapsePastedText(`${nineteenLines}\rnext line`)).toBe(true);
  });

  it.each(["", " ".repeat(2000), "\t\r\n".repeat(30)])("keeps whitespace-only clipboard contents inline", text => {
    expect(shouldCollapsePastedText(text)).toBe(false);
  });
});

describe("pasted text composition", () => {
  it("preserves untouched input exactly", () => {
    const input = "  开头\r\n\t中间 🐱\n结尾  ";
    expect(serializePastedTextDraft(plainDraft(input))).toBe(input);
  });

  it("pastes into the middle without adding separators or changing original text", () => {
    const original = plainDraft("start end");
    const next = insertPastedText(original, { id: "first", text: firstText }, 6, 6);

    expect(next.input).toBe("start end");
    expect(serializePastedTextDraft(next)).toBe(`start ${firstText}end`);
    expect(original).toEqual({ input: "start end", pastes: [] });
  });

  it("replaces the selected text just as a native paste would", () => {
    const next = insertPastedText(plainDraft("Intro old conclusion"), {
      id: "first", text: firstText,
    }, 6, 9);

    expect(next.input).toBe("Intro  conclusion");
    expect(serializePastedTextDraft(next)).toBe(`Intro ${firstText} conclusion`);
  });

  it("can replace all visible input with a single pasted card", () => {
    const next = insertPastedText(plainDraft("replace me"), {
      id: "first", text: firstText,
    }, 0, 10);

    expect(next.input).toBe("");
    expect(serializePastedTextDraft(next)).toBe(firstText);
  });

  it("keeps the document order when pastes are added at different positions", () => {
    let draft = insertPastedText(plainDraft("Start / End"), {
      id: "second", text: secondText,
    }, 8, 8);
    draft = insertPastedText(draft, { id: "first", text: firstText }, 6, 6);

    expect(serializePastedTextDraft(draft)).toBe(`Start ${firstText}/ ${secondText}End`);
    expect(draft.pastes.map(paste => paste.id)).toEqual(["first", "second"]);
  });

  it("keeps paste order for multiple cards sharing the same visible caret", () => {
    let draft = insertPastedText(plainDraft("Start / End"), {
      id: "second", text: secondText,
    }, 8, 8);
    draft = insertPastedText(draft, { id: "first", text: firstText }, 6, 6);
    draft = insertPastedText(draft, { id: "third", text: thirdText }, 6, 6);

    expect(serializePastedTextDraft(draft)).toBe(`Start ${firstText}${thirdText}/ ${secondText}End`);
    expect(draft.input).toBe("Start / End");
  });

  it("preserves existing cards when replacing surrounding visible text", () => {
    let draft = insertPastedText(plainDraft("alpha beta omega"), {
      id: "first", text: firstText,
    }, 6, 6);
    draft = insertPastedText(draft, { id: "second", text: secondText }, 11, 11);
    draft = insertPastedText(draft, { id: "third", text: thirdText }, 6, 10);

    expect(draft.input).toBe("alpha  omega");
    expect(serializePastedTextDraft(draft)).toBe(`alpha ${firstText}${thirdText} ${secondText}omega`);
  });
});

describe("editing visible text around pasted cards", () => {
  function draftWithMiddlePaste() {
    return insertPastedText(plainDraft("alpha beta"), {
      id: "first", text: firstText,
    }, 6, 6);
  }

  it("moves cards along with text inserted before them", () => {
    const next = updatePastedTextInput(draftWithMiddlePaste(), "prefix alpha beta");
    expect(serializePastedTextDraft(next)).toBe(`prefix alpha ${firstText}beta`);
  });

  it("keeps cards in place when text is added after them", () => {
    const next = updatePastedTextInput(draftWithMiddlePaste(), "alpha beta suffix");
    expect(serializePastedTextDraft(next)).toBe(`alpha ${firstText}beta suffix`);
  });

  it("adjusts their positions when preceding text is replaced or removed", () => {
    const replaced = updatePastedTextInput(draftWithMiddlePaste(), "Ω beta");
    expect(serializePastedTextDraft(replaced)).toBe(`Ω ${firstText}beta`);

    const removed = updatePastedTextInput(replaced, "beta");
    expect(serializePastedTextDraft(removed)).toBe(`${firstText}beta`);
  });

  it("types immediately after the paste when the collapsed caret remains at its insertion point", () => {
    const next = updatePastedTextInput(draftWithMiddlePaste(), "alpha typed beta");
    expect(serializePastedTextDraft(next)).toBe(`alpha ${firstText}typed beta`);
  });

  it("retains cards independently when all visible text is selected and replaced", () => {
    const next = updatePastedTextInput(draftWithMiddlePaste(), "replacement");
    expect(next.input).toBe("replacement");
    expect(serializePastedTextDraft(next)).toBe(`${firstText}replacement`);
  });
});

describe("editing repeated text with the actual caret and selection", () => {
  function repeatedDraft() {
    return insertPastedText(plainDraft("aaaa"), {
      id: "first", text: firstText,
    }, 2, 2);
  }

  it("places text typed before a card on its original side even when all letters match", () => {
    const next = updatePastedTextInput(repeatedDraft(), "aaaaa", { start: 1, end: 1 }, 2);
    expect(serializePastedTextDraft(next)).toBe(`aaa${firstText}aa`);
  });

  it("keeps text typed after a card on that side when the string diff is ambiguous", () => {
    const next = updatePastedTextInput(repeatedDraft(), "aaaaa", { start: 3, end: 3 }, 4);
    expect(serializePastedTextDraft(next)).toBe(`aa${firstText}aaa`);
  });

  it("replaces repeated text before a card using the selected range", () => {
    const next = updatePastedTextInput(repeatedDraft(), "aaaaa", { start: 0, end: 1 }, 2);
    expect(serializePastedTextDraft(next)).toBe(`aaa${firstText}aa`);
  });

  it("moves a card at the selection's right boundary after the replacement", () => {
    const next = updatePastedTextInput(repeatedDraft(), "aaaaa", { start: 0, end: 2 }, 3);
    expect(serializePastedTextDraft(next)).toBe(`aaa${firstText}aa`);
  });

  it("does not move a boundary card when selected text is replaced with identical text", () => {
    const next = updatePastedTextInput(repeatedDraft(), "aaaa", { start: 0, end: 2 }, 2);
    expect(serializePastedTextDraft(next)).toBe(`aa${firstText}aa`);
  });

  it("replaces repeated text after a card without moving the card", () => {
    const next = updatePastedTextInput(repeatedDraft(), "aaaaa", { start: 3, end: 4 }, 5);
    expect(serializePastedTextDraft(next)).toBe(`aa${firstText}aaa`);
  });

  it("uses the resulting caret for backspace before a card", () => {
    const next = updatePastedTextInput(repeatedDraft(), "aaa", { start: 1, end: 1 }, 0);
    expect(serializePastedTextDraft(next)).toBe(`a${firstText}aa`);
  });

  it("uses the resulting caret for backspace after a card", () => {
    const next = updatePastedTextInput(repeatedDraft(), "aaa", { start: 3, end: 3 }, 2);
    expect(serializePastedTextDraft(next)).toBe(`aa${firstText}a`);
  });

  it("keeps the end-boundary card after a forward deletion before it", () => {
    const next = updatePastedTextInput(repeatedDraft(), "aaa", { start: 1, end: 1 }, 1);
    expect(serializePastedTextDraft(next)).toBe(`a${firstText}aa`);
  });
});

describe("removing and expanding pasted text", () => {
  function threePastes() {
    let draft = insertPastedText(plainDraft("Start / End"), {
      id: "second", text: secondText,
    }, 8, 8);
    draft = insertPastedText(draft, { id: "first", text: firstText }, 6, 6);
    return insertPastedText(draft, { id: "third", text: thirdText }, 6, 6);
  }

  it("removes only the requested card and leaves all surrounding content intact", () => {
    const original = threePastes();
    const next = removePastedText(original, "first");

    expect(next.input).toBe("Start / End");
    expect(serializePastedTextDraft(next)).toBe(`Start ${thirdText}/ ${secondText}End`);
    expect(serializePastedTextDraft(original)).toBe(`Start ${firstText}${thirdText}/ ${secondText}End`);
  });

  it.each(["first", "second", "third"])("expands %s without changing the complete message", id => {
    const original = threePastes();
    const expanded = expandPastedText(original, id);

    expect(serializePastedTextDraft(expanded)).toBe(`Start ${firstText}${thirdText}/ ${secondText}End`);
    expect(expanded.pastes.map(paste => paste.id)).not.toContain(id);
    expect(expanded.pastes).toHaveLength(2);
  });

  it("keeps the full order while expanding all cards in a different order", () => {
    let draft = threePastes();
    for (const id of ["third", "second", "first"]) draft = expandPastedText(draft, id);

    expect(draft.pastes).toEqual([]);
    expect(draft.input).toBe(`Start ${firstText}${thirdText}/ ${secondText}End`);
    expect(serializePastedTextDraft(draft)).toBe(draft.input);
  });

  it("ignores a removed or unknown card without changing text", () => {
    const original = threePastes();
    expect(serializePastedTextDraft(removePastedText(original, "unknown"))).toBe(
      `Start ${firstText}${thirdText}/ ${secondText}End`,
    );
    expect(expandPastedText(original, "unknown")).toBe(original);
  });
});
