import {
  SELECTED_TEXT_MAX_CHARACTERS,
  addSelectedTextFragment,
  createSelectedTextFragment,
  selectedTextReferenceToAttachment,
} from "./selectedTextReference";

describe("selected text references", () => {
  it("preserves internal whitespace and creates a generic Platform reference", () => {
    const fragment = createSelectedTextFragment({
      text: "  const value = 1;\n\nreturn value;  ",
      targetId: "code:1",
      sourceKind: "code",
    });
    expect(fragment).not.toBeNull();
    expect(fragment?.reference).toMatchObject({
      type: "selection",
      name: "Selected code",
      mimeType: "text/plain",
      meta: {
        text: "const value = 1;\n\nreturn value;",
        sourceKind: "code",
      },
    });
    expect(selectedTextReferenceToAttachment(fragment!)).toMatchObject({
      id: fragment?.reference.id,
      type: "selection",
      meta: fragment?.reference.meta,
    });
  });

  it("deduplicates the same target and text while allowing distinct selections", () => {
    const first = createSelectedTextFragment({
      text: "hello",
      targetId: "message:1",
      sourceKind: "message",
    })!;
    const duplicate = createSelectedTextFragment({
      text: "hello",
      targetId: "message:1",
      sourceKind: "message",
    })!;
    const other = createSelectedTextFragment({
      text: "hello",
      targetId: "message:2",
      sourceKind: "message",
    })!;
    expect(addSelectedTextFragment([first], duplicate)).toHaveLength(1);
    expect(addSelectedTextFragment([first], other)).toHaveLength(2);
  });

  it("rejects empty and oversized selections", () => {
    expect(createSelectedTextFragment({
      text: "   ",
      targetId: "message:1",
      sourceKind: "message",
    })).toBeNull();
    expect(createSelectedTextFragment({
      text: "x".repeat(SELECTED_TEXT_MAX_CHARACTERS + 1),
      targetId: "message:1",
      sourceKind: "message",
    })).toBeNull();
  });
});
