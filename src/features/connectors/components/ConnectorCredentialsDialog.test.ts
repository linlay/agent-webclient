/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { checkConnectorConnection, getConnectorConnection, saveConnectorCredentials } from "@/shared/data";
import type { ConnectorAuthSession, ConnectorSummary } from "@/shared/data";
import { ConnectorCredentialsDialog } from "./ConnectorCredentialsDialog";
import { confirmCredentialState } from "../lib/connectorCredentials";
jest.mock("@/shared/data", () => ({ checkConnectorConnection: jest.fn(), getConnectorConnection: jest.fn(), saveConnectorCredentials: jest.fn(), prepareConnector: jest.fn() }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("antd", () => {
  const Input = ({ visibilityToggle: _visibility, ...props }: any) => React.createElement("input", props);
  Input.Password = (props: any) => React.createElement(Input, { ...props, type: "password" });
  return { Input, Modal: ({ children, onCancel }: any) => React.createElement("div", { role: "dialog" }, React.createElement("button", { onClick: onCancel }, "close"), children) };
});
const item: ConnectorSummary = { id: "token-one", name: "Token One", version: "1", type: "mcp", auth_mode: "token", hasCli: false, hasMcp: true, hasBin: false, skills: [], token_schema: { fields: [{ key: "SERVICE", label: "Service", type: "text", required: true, defaultValue: "https://example.test" }, { key: "API_KEY", label: "API key", type: "password", required: true }] } };
const auth = (changes: Partial<ConnectorAuthSession> = {}) => ({ code: 0, msg: "", data: { connectorId: item.id, sessionId: "", status: "authorized" as const, expiresAt: "", ...changes } });
let root: Root;
let container: HTMLDivElement;
const close = jest.fn(); const saved = jest.fn();
const button = (text: string) => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(node => node.textContent === text)!;
const mount = async (connector = item) => { await act(async () => root.render(React.createElement(ConnectorCredentialsDialog, { item: connector, onClose: close, onSaved: saved }))); };
async function input(label: string, text: string) {
  const field = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, text); field.dispatchEvent(new Event("input", { bubbles: true })); });
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.resetAllMocks();
  confirmCredentialState(item.id); confirmCredentialState("token-two");
  jest.mocked(saveConnectorCredentials).mockResolvedValue(auth());
  jest.mocked(checkConnectorConnection).mockResolvedValue(auth());
  jest.mocked(getConnectorConnection).mockResolvedValue({ code: 0, msg: "", data: { connectorId: item.id, configured: true, configurationRequired: true, readiness: "ready", authentication: auth().data, capabilities: { canConnect: false, canDisconnect: true, canCheck: true, authMode: "token", authBrowser: "system", hasCli: false, hasMcp: true } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
it("uses separate private credentials, erases values on success, and does not use browser storage", async () => {
  const storage = jest.spyOn(Storage.prototype, "setItem");
  await mount();
  expect(container.querySelector<HTMLInputElement>('[aria-label="API key"]')?.value).toBe("");
  await input("API key", "synthetic-test-token");
  await act(async () => button("connectors.credentials.save").click());
  expect(saveConnectorCredentials).toHaveBeenCalledWith(item.id, { SERVICE: "https://example.test", API_KEY: "synthetic-test-token" }, expect.any(AbortSignal));
  expect(saved).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
  expect(container.querySelector<HTMLInputElement>('[aria-label="API key"]')?.value).toBe("");
  expect(storage).not.toHaveBeenCalled(); storage.mockRestore();
});
it("clears input and aborts observation when canceled, ignoring an old write result", async () => {
  let resolve!: (value: any) => void;
  jest.mocked(saveConnectorCredentials).mockReturnValue(new Promise(done => { resolve = done; }));
  await mount(); await input("API key", "synthetic-test-token");
  await act(async () => button("connectors.credentials.save").click());
  const signal = jest.mocked(saveConnectorCredentials).mock.calls[0][2]!;
  await act(async () => button("close").click());
  expect(signal.aborted).toBe(true);
  expect(container.querySelector<HTMLInputElement>('[aria-label="API key"]')?.value).toBe("");
  await act(async () => resolve(auth()));
  expect(saved).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
  await act(async () => root.render(null));
  await mount();
  expect(container.textContent).toContain("connectors.credentials.unknownResult");
  expect(button("connectors.credentials.save").disabled).toBe(true);
  await act(async () => button("connectors.auth.refresh").click());
  expect(getConnectorConnection).toHaveBeenCalledTimes(2);
  expect(container.querySelector<HTMLInputElement>('[aria-label="API key"]')?.disabled).toBe(false);
});
it("never echoes a private error, never replays an unknown write, and requires a status check before new input", async () => {
  jest.mocked(saveConnectorCredentials).mockRejectedValue(new Error("echo synthetic-test-token from private endpoint"));
  await mount(); await input("API key", "synthetic-test-token");
  await act(async () => button("connectors.credentials.save").click());
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("connectors.credentials.unknownResult");
  expect(container.textContent).not.toContain("synthetic-test-token");
  expect(button("connectors.credentials.save").disabled).toBe(true);
  await act(async () => button("connectors.auth.refresh").click());
  expect(checkConnectorConnection).toHaveBeenCalledTimes(1);
  expect(saveConnectorCredentials).toHaveBeenCalledTimes(1);
  expect(container.querySelector<HTMLInputElement>('[aria-label="API key"]')?.disabled).toBe(false);
});
it("preserves the server pending-verification meaning while clearing the candidate input", async () => {
  jest.mocked(saveConnectorCredentials).mockResolvedValue(auth({ status: "authorized", pendingVerification: true }));
  await mount(); await input("API key", "synthetic-test-token");
  await act(async () => button("connectors.credentials.save").click());
  expect(container.textContent).toContain("connectors.credentials.pending");
  expect(saved).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
  expect(container.querySelector<HTMLInputElement>('[aria-label="API key"]')?.value).toBe("");
});
it("clears both fields and old completions when the installed connector identity changes", async () => {
  let resolve!: (value: any) => void;
  jest.mocked(saveConnectorCredentials).mockReturnValue(new Promise(done => { resolve = done; }));
  await mount(); await input("API key", "synthetic-test-token");
  await act(async () => button("connectors.credentials.save").click());
  await mount({ ...item, id: "token-two" });
  expect(container.querySelector<HTMLInputElement>('[aria-label="API key"]')?.value).toBe("");
  await act(async () => resolve(auth()));
  expect(saved).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});
it("does not create a credential field when manifest schema is missing", async () => {
  await mount({ ...item, token_schema: undefined });
  expect(container.querySelector("input")).toBeNull();
  expect(container.textContent).toContain("connectors.credentials.schemaInvalid");
  expect(button("connectors.credentials.save").disabled).toBe(true);
});
