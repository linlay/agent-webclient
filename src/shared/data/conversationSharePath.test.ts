import { buildConversationSharePath } from "@/shared/data/conversationSharePath";

describe("conversationSharePath", () => {
  it("builds paths only for explicit URL-safe share identifiers", () => {
    expect(buildConversationSharePath(" opaque_123 ")).toBe("/share/opaque_123");
    expect(buildConversationSharePath("bad.id")).toBe("");
    expect(buildConversationSharePath(undefined)).toBe("");
  });
});
