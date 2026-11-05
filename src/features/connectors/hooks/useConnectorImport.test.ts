/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ImportConnectorMCPRequest } from "@/shared/data";
import { useConnectorImport } from "./useConnectorImport";

jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
const onImport = jest.fn<Promise<string | null>, [File, boolean]>();
const onImportMCP = jest.fn<Promise<string | null>, [ImportConnectorMCPRequest]>();
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
  await act(async () => { current.show(); });
  await act(async () => current.setMCPName("Custom Tool"));
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
  expect(onImportMCP).toHaveBeenCalledWith({ name: "Custom Tool", id: "mcp-example-test", mcpUrl: "https://mcp.example.test/mcp", authMode: "none" });
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
  await act(async () => { current.close(); current.setMode("archive"); current.setMCPURL("https://other.test/mcp"); current.setAuthMode("none"); current.setMCPName("blocked"); void current.submit(); });
  expect(onImportMCP).toHaveBeenCalledTimes(1);
  expect(current.open).toBe(true);
  expect(current.mode).toBe("mcp");
  expect(current.authMode).toBe("mcp");
  expect(current.mcpName).toBe("Custom Tool");
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

it("imports a trimmed display name and clears it after success", async () => {
  onImportMCP.mockResolvedValueOnce("mcp.example.test");
  await act(async () => { current.setMode("mcp"); current.setMCPURL("https://mcp.example.test/mcp"); current.setMCPName("  团队知识库  "); current.setMCPId("team-knowledge"); });
  await act(async () => current.submit());
  expect(onImportMCP).toHaveBeenCalledWith({ id: "team-knowledge", mcpUrl: "https://mcp.example.test/mcp", name: "团队知识库", authMode: "mcp" });
  expect(current.mcpName).toBe("");
});

it("requires a name and clears metadata when cancelling and reopening", async () => {
  await act(async () => { current.setMode("mcp"); current.setMCPURL("https://mcp.example.test/mcp"); current.setMCPName("  "); });
  await act(async () => current.submit());
  expect(onImportMCP).not.toHaveBeenCalled();
  expect(current.error).toBe("connectors.import.mcp.nameRequired");
  await act(async () => current.setMCPName("团队知识库"));
  await act(async () => current.close());
  expect(current.mcpName).toBe("");
  await act(async () => current.show());
  expect(current.mcpName).toBe("");
});

it.each([
  { authMode: "oneid" as const },
  { authMode: "token" as const, tokenAuth: "bearer" as const },
  { authMode: "token" as const, tokenAuth: "basic" as const },
  { authMode: "token" as const, tokenAuth: "header" as const, headerName: "X-Custom-Key" },
])("imports authentication configuration without credential values: %j", async config => {
  onImportMCP.mockResolvedValueOnce("mcp.example.test");
  await act(async () => {
    current.setMode("mcp"); current.setMCPURL("https://mcp.example.test/mcp"); current.setAuthMode(config.authMode);
    if (config.tokenAuth) current.setTokenAuth(config.tokenAuth);
    if (config.headerName) current.setHeaderName("  " + config.headerName + "  ");
  });
  await act(async () => current.submit());
  expect(onImportMCP).toHaveBeenCalledWith({ name: "Custom Tool", id: "mcp-example-test", mcpUrl: "https://mcp.example.test/mcp", ...config });
});

it("validates API Key header names and omits token fields after changing auth mode", async () => {
  await act(async () => { current.setMode("mcp"); current.setMCPURL("https://mcp.example.test/mcp"); current.setAuthMode("token"); current.setTokenAuth("header"); current.setHeaderName("bad header"); });
  await act(async () => current.submit());
  expect(onImportMCP).not.toHaveBeenCalled();
  expect(current.error).toBe("connectors.import.mcp.invalidHeader");
  await act(async () => current.setAuthMode("oneid"));
  await act(async () => current.submit());
  expect(onImportMCP).toHaveBeenCalledWith({name:"Custom Tool", id:"mcp-example-test", mcpUrl:"https://mcp.example.test/mcp", authMode:"oneid"});
  await act(async () => current.show());
  expect(current.authMode).toBe("mcp"); expect(current.tokenAuth).toBe("bearer"); expect(current.headerName).toBe("X-API-Key");
});

it("derives a connector ID from the URL, preserves an edited ID and sends optional metadata", async () => {
  await act(async () => {current.setMode("mcp");current.setMCPURL("http://127.0.0.1:8080/mcp");current.setMCPName("Team Search");});
  expect(current.mcpId).toBe("local-8080");
  await act(async () => {current.setMCPId("team-tools");current.setMCPURL("https://changed.example.test/mcp");current.setMCPName("团队工具");current.setDescription("  查询团队知识  ");current.setIconPreset("database");});
  expect(current.mcpId).toBe("team-tools");
  await act(async () => current.submit());
  expect(onImportMCP).toHaveBeenCalledWith({name:"团队工具",id:"team-tools",description:"查询团队知识",iconPreset:"database",mcpUrl:"https://changed.example.test/mcp",authMode:"mcp"});
});

it("validates icon uploads, switches between presets and PNG, and clears metadata on close", async () => {
  const icon=new File([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHfoAAAAASUVORK5CYII="),c=>c.charCodeAt(0))],"icon.png",{type:"image/png"});
  await act(async () => current.setIconPreset("hub"));
  await act(async () => current.acceptIcon(new File(["bad"],"icon.svg")));
  expect(current.error).toBe("connectors.import.mcp.invalidIcon");
  await act(async () => current.acceptIcon(new File([new Uint8Array(32 * 1024 + 1)], "large.png")));
  expect(current.error).toBe("connectors.import.mcp.invalidIcon");
  await act(async () => current.acceptIcon(icon));
  expect(current.iconPng).toBeTruthy();expect(current.iconPreset).toBeUndefined();
  await act(async () => current.setIconPreset("database"));
  expect(current.iconPng).toBe("");expect(current.iconPreset).toBe("database");
  await act(async () => current.close());
  expect(current.iconPreset).toBeUndefined();expect(current.mcpId).toBe("");expect(current.description).toBe("");
});
