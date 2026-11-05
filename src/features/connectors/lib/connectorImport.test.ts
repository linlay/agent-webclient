import { connectorUrlToId, validConnectorImportId, CONNECTOR_ARCHIVE_MAX_BYTES, connectorImportErrorKey, isConnectorImportConflict, validateConnectorArchive, validateConnectorMCPURL } from "./connectorImport";

describe("connector ZIP validation", () => {
  it("accepts ZIP names without requiring browser MIME detection and enforces the backend upload limit", () => {
    expect(validateConnectorArchive({ name: "connector.ZIP", size: CONNECTOR_ARCHIVE_MAX_BYTES })).toBe("");
    expect(validateConnectorArchive({ name: "connector.zip", size: CONNECTOR_ARCHIVE_MAX_BYTES + 1 })).toBe("size");
    expect(validateConnectorArchive({ name: "connector.zip", size: 0 })).toBe("empty");
    expect(validateConnectorArchive({ name: "connector.tar", size: 100 })).toBe("type");
    expect(validateConnectorArchive(null)).toBe("type");
  });
  it("only offers overwrite for the explicit installed-package conflict", () => {
    expect(isConnectorImportConflict({ status: 409, code: "connector_exists" })).toBe(true);
    expect(isConnectorImportConflict({ status: 409, code: "conflict" })).toBe(false);
    expect(isConnectorImportConflict({ status: 403, code: "builtin_connector_readonly" })).toBe(false);
    expect(connectorImportErrorKey({ status: 403, code: "builtin_connector_readonly" })).toBe("connectors.import.error.builtin");
    expect(connectorImportErrorKey({ status: 413 })).toBe("connectors.import.error.serverSize");
  });
});

it.each([
  ["https://example.test/mcp", true], [" http://localhost:8080/mcp ", true],
  ["https://example.test/mcp?key=value", true], ["https://example.test/mcp#", false],
  ["https://user:password@example.test/mcp", false], ["ftp://example.test/mcp", false],
  ["https:example.test/mcp", false], ["not a URL", false],
])("validates MCP URL %s", (url, valid) => expect(validateConnectorMCPURL(url as string)).toBe(valid));

it("generates connector IDs from URL host and port, excluding paths and credentials", () => {
  expect(connectorUrlToId("https://example.com/mcp?key=private")).toBe("example-com");
  expect(connectorUrlToId("http://127.0.0.1:8080/mcp")).toBe("local-8080");
  expect(connectorUrlToId("http://localhost:3000/sse")).toBe("local-3000");
  expect(connectorUrlToId("http://[::1]:8080/mcp")).toBe("local-8080");
  expect(connectorUrlToId("https://example.com:443/mcp")).toBe("example-com");
  expect(connectorUrlToId("https://example.com:8443/mcp")).toBe("example-com-8443");
  expect(connectorUrlToId("invalid")).toBe("");
  expect(validConnectorImportId("team-knowledge")).toBe(true);
  expect(validConnectorImportId("../escape")).toBe(false);
  expect(validConnectorImportId("builtin.foo")).toBe(false);
});
