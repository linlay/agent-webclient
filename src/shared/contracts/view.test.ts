import { readViewReference } from "./view";
test("VIEW reference rejects paths and malformed snapshot hashes", () => {
  expect(readViewReference({ source: "connector", connectorId: "crm", key: "edit", hash: "a".repeat(64) })?.hash).toHaveLength(64);
  expect(readViewReference({ source: "connector", connectorId: "../crm", key: "edit" })).toBeUndefined();
  expect(readViewReference({ source: "connector", connectorId: "crm", key: "edit", hash: "latest" })).toBeUndefined();
});
