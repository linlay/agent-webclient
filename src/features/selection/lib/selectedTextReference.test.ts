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
      text: "const value = 1;\n\nreturn value;",
      meta: {
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

it("preserves optional annotations through attachments and name-free server references", () => {
  const { updateSelectedTextAnnotation, selectedTextFragmentFromAttachment } = require("./selectedTextReference");
  const { normalizeTimelineAttachments } = require("@/features/events/lib/timelineAttachments");
  const original = createSelectedTextFragment({text:"quote",targetId:"m1",sourceKind:"message"})!;
  const updated = updateSelectedTextAnnotation([original], original.reference.id, "rewrite\ncarefully")[0];
  expect(original.reference.annotation).toBeUndefined();
  const attachment = selectedTextReferenceToAttachment(updated);
  expect(selectedTextFragmentFromAttachment(attachment)?.reference).toEqual(updated.reference);
  const replay = normalizeTimelineAttachments([{id:original.reference.id,type:"selection",text:"quote",annotationIndex:original.reference.annotationIndex,annotation:"rewrite\ncarefully"}]);
  expect(selectedTextFragmentFromAttachment(replay[0])?.reference).toEqual(updated.reference);
  expect(updateSelectedTextAnnotation([updated], original.reference.id, " ")[0].reference).not.toHaveProperty("annotation");
  expect(selectedTextFragmentFromAttachment({id:"legacy",name:"Selected text",type:"selection",meta:{text:"old"}})).toBeNull();
});

it("allocates only inside the destination draft without mutating captured references", () => {
  const { updateSelectedTextAnnotation, validAnnotationIndex } = require("./selectedTextReference");
  const first = createSelectedTextFragment({text:"one",targetId:"m1",sourceKind:"message"})!;
  const second = createSelectedTextFragment({text:"two",targetId:"m2",sourceKind:"message"})!;
  expect(first.reference.annotationIndex).toBeUndefined();
  const numbered = addSelectedTextFragment(addSelectedTextFragment([],first),second);
  expect(numbered.map(f=>f.reference.annotationIndex)).toEqual([1,2]);
  expect(updateSelectedTextAnnotation(numbered,second.reference.id,"comment")[1].reference.annotationIndex).toBe(2);
  validAnnotationIndex(999);
  const incoming = {...first,reference:{...first.reference,annotationIndex:100}};
  expect(addSelectedTextFragment([],incoming)[0].reference.annotationIndex).toBe(1);
  expect(addSelectedTextFragment([],first,3)[0].reference.annotationIndex).toBe(3);
});
