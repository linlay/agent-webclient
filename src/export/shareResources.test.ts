import { canonicalChatSourceRef } from "./shareResources";

it("reads an @chat/ address literally and matches the Platform resource key", () => {
  expect(canonicalChatSourceRef("@chat/artifacts/run_1/报告 100%.md")).toBe("artifacts/run_1/%E6%8A%A5%E5%91%8A%20100%25.md");
  // Nothing is decoded: this file is really named "a%20b.md".
  expect(canonicalChatSourceRef("@chat/artifacts/run_1/a%20b.md")).toBe("artifacts/run_1/a%2520b.md");
  expect(canonicalChatSourceRef("@chat/artifacts/%2e%2e/a.md")).toBeNull();
  expect(canonicalChatSourceRef("@workspace/a.md")).toBeNull();
});
