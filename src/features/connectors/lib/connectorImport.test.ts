import { CONNECTOR_ARCHIVE_MAX_BYTES, connectorImportErrorKey, isConnectorImportConflict, validateConnectorArchive } from "./connectorImport";

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
