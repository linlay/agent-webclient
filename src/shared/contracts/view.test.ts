import { readViewReference } from "./view";
test("VIEW reference rejects paths and malformed snapshot hashes", () => {
  expect(readViewReference({ connectorId: "crm", key: "edit", hash: "a".repeat(64) })?.hash).toHaveLength(64);
  expect(readViewReference({ connectorId: "../crm", key: "edit" })).toBeUndefined();
  expect(readViewReference({ connectorId: "crm", key: "edit", hash: "latest" })).toBeUndefined();
});
