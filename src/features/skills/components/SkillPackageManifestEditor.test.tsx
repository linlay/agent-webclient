/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { SkillPackageManifestEditor } from "./SkillPackageManifestEditor";
import { getAdminSkillPackageManifest, saveAdminSkillPackageManifest } from "@/shared/data/api/requests/skillPackages";
jest.mock("@/shared/data/api/requests/skillPackages", () => ({ getAdminSkillPackageManifest: jest.fn(), saveAdminSkillPackageManifest: jest.fn() }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("antd", () => ({
  Modal: ({ open, title, children, onOk, onCancel, okText, okButtonProps }: any) => open ? <section aria-label={title}>{children}<button disabled={okButtonProps?.disabled} onClick={onOk}>{okText}</button><button onClick={onCancel}>close</button></section> : null,
  Spin: ({ children }: any) => children,
  Alert: ({ message, action }: any) => <div role="alert">{message}{action}</div>,
}));
jest.mock("@/shared/ui/CodeEditor", () => ({ CodeEditor: ({ value, onChange }: any) => <textarea value={value} onChange={event => onChange(event.target.value)} /> }));
let container: HTMLDivElement;
let root: Root;
const onClose = jest.fn();
const onSaved = jest.fn().mockResolvedValue(undefined);
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  jest.mocked(getAdminSkillPackageManifest).mockResolvedValue({ code: 0, msg: "", data: { content: '{"name":"office"}', sha256: "old-hash" } });
  jest.mocked(saveAdminSkillPackageManifest).mockResolvedValue({ code: 0, msg: "", data: { content: '{"name":"office","displayName":"Office"}', sha256: "new-hash" } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function mount() { await act(async () => root.render(<SkillPackageManifestEditor packageId="office" onClose={onClose} onSaved={onSaved} />)); }
async function edit(value: string) { await act(async () => Simulate.change(container.querySelector("textarea")!, { target: { value } } as any)); }
async function save() { await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "skillConsole.action.save")!.click()); }
test("saves metadata using original hash and refreshes the package catalog", async () => {
  await mount();
  await edit('{"name":"office","displayName":"Office"}');
  await save();
  expect(saveAdminSkillPackageManifest).toHaveBeenCalledWith("office", '{"name":"office","displayName":"Office"}', "old-hash");
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});
test("blocks identity changes and a hand-maintained member list", async () => {
  await mount();
  await edit('{"name":"other"}'); await save();
  expect(saveAdminSkillPackageManifest).not.toHaveBeenCalled();
  await edit('{"name":"office","skills":[]}'); await save();
  expect(saveAdminSkillPackageManifest).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("manifestInvalid");
});
test("conflicting save preserves the draft and never retries with a fresh hash", async () => {
  jest.mocked(saveAdminSkillPackageManifest).mockRejectedValueOnce(new Error("Conflict: manifest changed"));
  await mount(); await edit('{"name":"office","description":"draft"}'); await save();
  expect(onClose).not.toHaveBeenCalled();
  expect(container.querySelector("textarea")?.value).toContain("draft");
  expect(getAdminSkillPackageManifest).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Conflict");
});
test("closing a dirty manifest requires explicit discard", async () => {
  await mount(); await edit('{"name":"office","description":"draft"}');
  await act(async () => container.querySelector<HTMLButtonElement>("section button:last-child")!.click());
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "skillPackageEditor.discard")!.click());
  expect(onClose).toHaveBeenCalledTimes(1);
});
