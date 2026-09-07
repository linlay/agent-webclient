/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useConnectorsRuntime } from "./useConnectorsRuntime";
import { ApiError, getAdminConnectors, getAdminTools, getConnectorDefinition, updateConnectorDefinition } from "@/shared/data";
import type { ConnectorDefinition, ConnectorSummary } from "@/shared/data";

const push = { subscribe: jest.fn(() => jest.fn()) };
const blocker = { state: "unblocked" };
jest.mock("react-router-dom", () => ({ useBlocker: () => blocker }));
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ usePushTransport: () => push }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/shared/data", () => ({
  ApiError: class extends Error { status: number; constructor(message: string, { status }: { status: number }) { super(message); this.status = status; } },
  getAdminConnectors: jest.fn(), getAdminTools: jest.fn(), getConnectorDefinition: jest.fn(), updateConnectorDefinition: jest.fn(),
}));

const item: ConnectorSummary = { id: "demo", name: "Demo", version: "1.0.0", type: "cli", auth_mode: "none", hasCli: true, hasMcp: true, hasBin: true, skills: [], mcp: [] };
const definition: ConnectorDefinition = { id: "demo", file: "connector.json", content: '{"name":"Demo"}', sha256: "sha-1" };
let current: ReturnType<typeof useConnectorsRuntime>;
function Harness({ id = "demo" }: { id?: string }) { current = useConnectorsRuntime(id, jest.fn()); return null; }
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
