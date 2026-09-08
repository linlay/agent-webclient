/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useConnectorsRuntime } from "./useConnectorsRuntime";
import { ApiError, getAdminConnectors, getAdminTools, getConnectorDefinition, importConnectorArchive, updateConnectorDefinition } from "@/shared/data";
import type { ConnectorDefinition, ConnectorSummary } from "@/shared/data";

const push = { subscribe: jest.fn(() => jest.fn()) };
const blocker = { state: "unblocked" };
jest.mock("react-router-dom", () => ({ useBlocker: () => blocker }));
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ usePushTransport: () => push }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/shared/data", () => ({
  ApiError: class extends Error { status: number; constructor(message: string, { status }: { status: number }) { super(message); this.status = status; } },
  getAdminConnectors: jest.fn(), getAdminTools: jest.fn(), getConnectorDefinition: jest.fn(), importConnectorArchive: jest.fn(), updateConnectorDefinition: jest.fn(),
}));

const item: ConnectorSummary = { id: "demo", name: "Demo", version: "1.0.0", type: "cli", auth_mode: "none", hasCli: true, hasMcp: true, hasBin: true, skills: [], mcp: [] };
const definition: ConnectorDefinition = { id: "demo", file: "connector.json", content: '{"name":"Demo"}', sha256: "sha-1" };
let current: ReturnType<typeof useConnectorsRuntime>;
const onRouteIdChange = jest.fn();
function Harness({ id = "demo" }: { id?: string }) { current = useConnectorsRuntime(id, onRouteIdChange); return null; }
let root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  jest.mocked(getAdminConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: [item, { ...item, id: "other" }] } });
  jest.mocked(getAdminTools).mockResolvedValue({ code: 0, msg: "", data: [] });
  jest.mocked(getConnectorDefinition).mockImplementation(async target => ({ code: 0, msg: "", data: { ...definition, ...target } }));
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); jest.restoreAllMocks(); });
const mount = async (id = "demo") => { await act(async () => root.render(React.createElement(Harness, { id }))); };

it("preserves drafts across catalog refreshes and sends the loaded hash on save", async () => {
  await mount();
  await act(async () => current.updateDraft('{"name":"Edited"}'));
  await act(async () => current.refreshCatalog(true));
  expect(current.draft).toBe('{"name":"Edited"}');
  expect(getConnectorDefinition).toHaveBeenCalledTimes(1);
  jest.mocked(updateConnectorDefinition).mockResolvedValue({ code: 0, msg: "", data: { ...definition, content: '{"name":"Edited"}', sha256: "sha-2" } });
  await act(async () => current.save());
  expect(updateConnectorDefinition).toHaveBeenCalledWith({ id: "demo", file: "connector.json", content: '{"name":"Edited"}', baseSha256: "sha-1" });
  expect(current.dirty).toBe(false);
  expect(current.detail?.sha256).toBe("sha-2");
});

it("keeps the draft and original hash when the server reports a conflict", async () => {
  await mount();
  await act(async () => current.updateDraft('{"name":"Mine"}'));
  jest.mocked(updateConnectorDefinition).mockRejectedValue(new ApiError("conflict", { status: 409 }));
  await act(async () => current.save());
  expect(current.error).toBe("connectors.error.conflict");
  expect(current.draft).toBe('{"name":"Mine"}');
  expect(current.detail?.sha256).toBe("sha-1");
});

it("does not submit malformed JSON or overwrite a dirty file when switching is cancelled", async () => {
  await mount();
  await act(async () => current.updateDraft("{"));
  await act(async () => current.save());
  expect(updateConnectorDefinition).not.toHaveBeenCalled();
  jest.spyOn(window, "confirm").mockReturnValue(false);
  await act(async () => current.selectFile("cli.json"));
  expect(current.file).toBe("connector.json");
  expect(current.draft).toBe("{");
  jest.mocked(window.confirm).mockReturnValue(true);
  await act(async () => current.selectFile("cli.json"));
  expect(current.detail?.file).toBe("cli.json");
  expect(current.dirty).toBe(false);
});

it("ignores a late response after switching connectors", async () => {
  let resolveOld!: (value: any) => void;
  jest.mocked(getConnectorDefinition).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  await mount();
  await mount("other");
  expect(current.detail?.id).toBe("other");
  await act(async () => resolveOld({ code: 0, msg: "", data: definition }));
  expect(current.detail?.id).toBe("other");
});

it("keeps the selected draft when a background catalog update removes its package", async () => {
  await mount();
  await act(async () => current.updateDraft('{"name":"Unsaved"}'));
  jest.mocked(getAdminConnectors).mockResolvedValue({ code: 0, msg: "", data: { connectors: [{ ...item, id: "other" }] } });
  await act(async () => current.refreshCatalog(true));
  expect(current.selected?.id).toBe("demo");
  expect(current.draft).toBe('{"name":"Unsaved"}');
  expect(current.detail?.sha256).toBe("sha-1");
});

it("preserves a dirty draft when ZIP import fails or the discard confirmation is cancelled", async () => {
  await mount();
  await act(async () => current.updateDraft('{"name":"Unsaved"}'));
  const file = new File(["zip"], "connector.zip");
  jest.spyOn(window, "confirm").mockReturnValue(false);
  await act(async () => expect(current.importArchive(file, false)).resolves.toBeNull());
  expect(importConnectorArchive).not.toHaveBeenCalled();
  jest.mocked(window.confirm).mockReturnValue(true);
  jest.mocked(importConnectorArchive).mockRejectedValue(new Error("invalid package"));
  await act(async () => expect(current.importArchive(file, false)).rejects.toThrow("invalid package"));
  expect(current.draft).toBe('{"name":"Unsaved"}');
  expect(current.detail?.sha256).toBe("sha-1");
  expect(current.importing).toBe(false);
  expect(onRouteIdChange).not.toHaveBeenCalled();
});

it("reloads the overwritten package hash and navigates after successful import", async () => {
  await mount();
  await act(async () => current.updateDraft('{"name":"Old draft"}'));
  jest.spyOn(window, "confirm").mockReturnValue(true);
  jest.mocked(importConnectorArchive).mockResolvedValue({ status: 200, code: 0, msg: "", data: { id: "demo", name: "Imported", version: "2.0.0", installed: true, authMode: "none" } });
  jest.mocked(getConnectorDefinition).mockResolvedValue({ status: 200, code: 0, msg: "", data: { ...definition, content: '{"name":"Imported"}', sha256: "sha-imported" } });
  await act(async () => expect(current.importArchive(new File(["zip"], "connector.zip"), true)).resolves.toBe("demo"));
  expect(current.draft).toBe('{"name":"Imported"}');
  expect(current.detail?.sha256).toBe("sha-imported");
  expect(current.dirty).toBe(false);
  expect(onRouteIdChange).toHaveBeenCalledWith("demo");
  expect(getAdminConnectors).toHaveBeenCalledTimes(2);
});

it("does not report a successful import as failed if the subsequent catalog refresh fails", async () => {
  await mount();
  jest.mocked(importConnectorArchive).mockResolvedValue({ status: 200, code: 0, msg: "", data: { id: "new", name: "New", version: "1.0.0", installed: true, authMode: "none" } });
  jest.mocked(getAdminConnectors).mockRejectedValue(new Error("refresh unavailable"));
  await act(async () => expect(current.importArchive(new File(["zip"], "connector.zip"), false)).resolves.toBe("new"));
  expect(current.catalogError).toBe("refresh unavailable");
  expect(onRouteIdChange).toHaveBeenCalledWith("new");
});

it("keeps built-in definitions readable and rejects edits and saves", async () => {
  jest.mocked(getAdminConnectors).mockResolvedValue({ status: 200, code: 0, msg: "", data: { connectors: [{ ...item, builtin: true, readOnly: true, canDelete: false }] } });
  await mount();
  expect(current.readOnly).toBe(true);
  await act(async () => current.updateDraft('{"name":"Changed"}'));
  await act(async () => current.save());
  expect(current.draft).toBe(definition.content);
  expect(updateConnectorDefinition).not.toHaveBeenCalled();
});

it("preserves HTTP 401 diagnostics for the catalog entry point and clears them after recovery", async () => {
  jest.mocked(getAdminConnectors).mockRejectedValueOnce(new ApiError("unauthorized", { status: 401 }));
  await mount();
  expect(current.catalogErrorStatus).toBe(401);
  await act(async () => current.refreshCatalog());
  expect(current.catalogErrorStatus).toBeNull();
  expect(current.catalogError).toBe("");
});
