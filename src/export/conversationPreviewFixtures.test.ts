import { parseConversationSnapshot } from "./conversationSnapshot";

const fixtures = require("../../qa/conversation-export-fixtures.cjs") as Record<string, unknown>;

describe("conversation export preview fixtures", () => {
  it("keeps every preview case within the production snapshot contract", () => {
    for (const value of Object.values(fixtures)) {
      expect(parseConversationSnapshot(JSON.stringify(value))).not.toBeNull();
    }
  });
});
