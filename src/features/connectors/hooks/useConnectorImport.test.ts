/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useConnectorImport } from "./useConnectorImport";

jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
const onImport = jest.fn<Promise<string | null>, [File, boolean]>();
const onImportMCP = jest.fn<Promise<string | null>, [{ mcpUrl: string; authMode?: "mcp" | "none" }]>();
const onImported = jest.fn();
let current: ReturnType<typeof useConnectorImport>;
let root: Root;
function Harness() { current = useConnectorImport({ onImport, onImportMCP, onImported }); return null; }
const archive = () => new File(["zip fixture"], "connector.zip", { type: "application/zip" });
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.resetAllMocks();
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(React.createElement(Harness)));
  await act(async () => current.show());
});
afterEach(async () => { await act(async () => root.unmount()); });

it("requires a separate user action before retrying with overwrite", async () => {
  const file = archive();
  onImport.mockRejectedValueOnce({ status: 409, code: "connector_exists" }).mockResolvedValueOnce("demo");
  await act(async () => current.acceptFiles([file]));
  await act(async () => current.submit());
  expect(onImport.mock.calls).toEqual([[file, false]]);
  expect(current.overwriteRequired).toBe(true);
  expect(current.archive).toBe(file);
  expect(current.open).toBe(true);
  await act(async () => current.submit());
  expect(onImport.mock.calls).toEqual([[file, false], [file, true]]);
  expect(current.open).toBe(false);
  expect(onImported).toHaveBeenCalledWith("demo");
  expect(onImported).toHaveBeenCalledTimes(1);
});

it("does not upload invalid files and clears overwrite approval when the file changes", async () => {
  await act(async () => current.acceptFiles([archive(), archive()]));
  await act(async () => current.submit());
  expect(current.error).toBe("connectors.import.error.multiple");
  expect(onImport).not.toHaveBeenCalled();
  onImport.mockRejectedValueOnce({ status: 409, code: "connector_exists" });
  await act(async () => current.acceptFiles([archive()]));
  await act(async () => current.submit());
  await act(async () => current.acceptFiles([new File(["data"], "new.zip")]));
  expect(current.overwriteRequired).toBe(false);
  expect(current.error).toBe("");
});

it("retains a failed archive and blocks both closing and duplicate submissions while uploading", async () => {
  let reject!: (cause: Error) => void;
  onImport.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  const file = archive();
  await act(async () => current.acceptFiles([file]));
  let request!: Promise<void>;
  await act(async () => { request = current.submit(); });
  await act(async () => { current.close(); void current.submit(); current.acceptFiles([archive()]); });
  expect(current.open).toBe(true);
  expect(current.archive).toBe(file);
  expect(onImport).toHaveBeenCalledTimes(1);
  await act(async () => { reject(new Error("invalid connector package")); await request; });
  expect(current.error).toBe("invalid connector package");
  expect(current.errorDetails).toContain("invalid connector package");
  expect(current.archive).toBe(file);
  expect(current.overwriteRequired).toBe(false);
});

it("allows cancelling the overwrite prompt without modifying the existing package", async () => {
  onImport.mockRejectedValueOnce({ status: 409, code: "connector_exists" });
  await act(async () => current.acceptFiles([archive()]));
  await act(async () => current.submit());
  await act(async () => current.close());
  expect(onImport).toHaveBeenCalledTimes(1);
  expect(onImported).not.toHaveBeenCalled();
  await act(async () => current.show());
  expect(current.archive).toBeNull();
  expect(current.overwriteRequired).toBe(false);
});

it("imports a trimmed MCP URL with an explicit auth mode and clears it after success", async () => {
  onImportMCP.mockResolvedValueOnce("mcp.example.test");
  await act(async () => current.setMode("mcp"));
  expect(current.canSubmit).toBe(false);
  await act(async () => { current.setMCPURL("  https://mcp.example.test/mcp  "); current.setAuthMode("none"); });
  await act(async () => current.submit());
  expect(onImportMCP).toHaveBeenCalledWith({ mcpUrl: "https://mcp.example.test/mcp", authMode: "none" });
  expect(onImport).not.toHaveBeenCalled();
  expect(onImported).toHaveBeenCalledWith("mcp.example.test");
  expect(current.open).toBe(false);
  expect(current.mcpUrl).toBe("");
});

it("validates MCP URLs and never offers overwrite for a hostname conflict", async () => {
  await act(async () => { current.setMode("mcp"); current.setMCPURL("https://user:password@mcp.example.test/mcp"); });
  await act(async () => current.submit());
  expect(current.error).toBe("connectors.import.mcp.invalidUrl");
  expect(onImportMCP).not.toHaveBeenCalled();
  onImportMCP.mockRejectedValueOnce({ status: 409, code: "connector_exists" });
  await act(async () => current.setMCPURL("https://mcp.example.test/mcp"));
  await act(async () => current.submit());
  expect(current.error).toBe("connectors.import.mcp.exists");
  expect(current.overwriteRequired).toBe(false);
  expect(current.open).toBe(true);
  expect(current.mcpUrl).toBe("https://mcp.example.test/mcp");
  await act(async () => current.close());
  expect(current.mcpUrl).toBe("");
});

it("blocks duplicate MCP imports and mode changes until installation finishes", async () => {
  let resolve!: (id: string) => void;
  onImportMCP.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await act(async () => { current.setMode("mcp"); current.setMCPURL("https://mcp.example.test/mcp"); });
  let pending!: Promise<void>;
  await act(async () => { pending = current.submit(); });
  await act(async () => { current.close(); current.setMode("archive"); current.setMCPURL("https://other.test/mcp"); current.setAuthMode("none"); void current.submit(); });
  expect(onImportMCP).toHaveBeenCalledTimes(1);
  expect(current.open).toBe(true);
  expect(current.mode).toBe("mcp");
  expect(current.authMode).toBe("mcp");
  expect(current.mcpUrl).toBe("https://mcp.example.test/mcp");
  await act(async () => { resolve("mcp.example.test"); await pending; });
  expect(current.submitting).toBe(false);
});

it("uses MCP request limits for an oversized URL instead of ZIP package limits", async () => {
  onImportMCP.mockRejectedValueOnce({ status: 413, code: "payload_too_large" });
  await act(async () => { current.setMode("mcp"); current.setMCPURL("https://mcp.example.test/mcp"); });
  await act(async () => current.submit());
  expect(current.error).toBe("connectors.import.mcp.serverSize");
});
