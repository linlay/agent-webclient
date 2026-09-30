/** @jest-environment jsdom */
import type { ConnectorSummary } from "@/shared/data";
import { connectorTokenSchema, initialConnectorCredentials, validatedConnectorCredentials } from "./connectorCredentials";
const item: ConnectorSummary = { id: "private", name: "Private", version: "1", type: "mcp", auth_mode: "token", hasMcp: true, hasCli: false, hasBin: false, skills: [], token_schema: {
  fields: [{ key: "URL", label: "Service URL", type: "text", required: true, defaultValue: "https://example.test" }, { key: "API_KEY", label: "API key", type: "password", required: true }],
} };
it("uses declared fields and text defaults without ever prefilling passwords", () => {
  const schema = connectorTokenSchema(item)!;
  expect(initialConnectorCredentials(schema)).toEqual({ URL: "https://example.test", API_KEY: "" });
  expect(validatedConnectorCredentials(schema, { URL: "https://example.test", API_KEY: "synthetic-test-token", EXTRA: "not declared" })).toEqual({ URL: "https://example.test", API_KEY: "synthetic-test-token" });
  expect(validatedConnectorCredentials(schema, { URL: "", API_KEY: "test" })).toBeNull();
  expect(validatedConnectorCredentials(schema, { URL: "url", API_KEY: "test\nline" })).toBeNull();
  expect(validatedConnectorCredentials(schema, { URL: "url", API_KEY: "测".repeat(30_000) })).toBeNull();
});
it.each([
  { fields: [] },
  { fields: [{ key: "secret", label: "Key", required: true }] },
  { fields: [{ key: "API_KEY", label: "Key", required: true, type: "password", defaultValue: "test" }] },
  { fields: [{ key: "A", label: "A", required: true }, { key: "A", label: "Duplicate", required: true }] },
])("rejects invalid field schemas instead of sending users to JSON credentials", schema => {
  expect(connectorTokenSchema({ ...item, token_schema: schema })).toBeNull();
});
it("normalizes only documented legacy metadata and rejects unsafe documentation URLs", () => {
  const schema = connectorTokenSchema({ ...item, token_schema: { fields: [{ name: "API_KEY", label: "Key", required: true }], docUrl: "https://user:password@example.test" } })!;
  expect(schema.fields[0]).toEqual({ key: "API_KEY", label: "Key", type: "password", required: true });
  expect(schema.docUrl).toBeUndefined();
});
