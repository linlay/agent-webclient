/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import type { AdminSourceResponse } from "@/shared/data/api/dto/admin";
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
const originalContent = JSON.stringify({ name: "office", skills: [{ key: "word" }, { key: "excel" }] });
function source(content: string, sha256: string): AdminSourceResponse {
  return { target: { type: "skill-package", key: "office" }, source: { kind: "skills-center", path: "office/package.json" }, content, sha256, encoding: "utf-8", size: content.length };
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  jest.mocked(getAdminSkillPackageManifest).mockResolvedValue({ code: 0, msg: "", data: source(originalContent, "old-hash") });
  jest.mocked(saveAdminSkillPackageManifest).mockResolvedValue({ code: 0, msg: "", data: source(originalContent, "new-hash") });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function mount() { await act(async () => root.render(<SkillPackageManifestEditor packageId="office" onClose={onClose} onSaved={onSaved} />)); }
async function edit(value: string) { await act(async () => Simulate.change(container.querySelector("textarea")!, { target: { value } } as any)); }
async function save() { await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "skillConsole.action.save")!.click()); }
test("saves declared members in order using the original hash and refreshes the catalog", async () => {
  await mount();
  const content = JSON.stringify({ name: "office", displayName: "Office", skills: [{ key: "excel" }, { key: "word" }] });
  await edit(content);
  await save();
  expect(saveAdminSkillPackageManifest).toHaveBeenCalledWith("office", content, "old-hash");
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});
test("allows an explicitly empty package", async () => {
  await mount();
  const content = '{"name":"office","skills":[]}';
  await edit(content); await save();
  expect(saveAdminSkillPackageManifest).toHaveBeenCalledWith("office", content, "old-hash");
});
test.each([
  { name: "other", skills: [] },
  { name: "office" },
  { name: "office", skills: null },
  { name: "office", skills: {} },
  ...[null, [], "child", {}, { key: 1 }, { key: "" }, { key: " " }, { key: " child" },
    { key: "." }, { key: ".." }, { key: "a/b" }, { key: "a\\b" }, { key: "a\u0000b" }]
    .map(member => ({ name: "office", skills: [member] })),
  { name: "office", skills: [{ key: "child" }, { key: "CHILD" }] },
])("blocks invalid manifest %j without changing the draft", async manifest => {
  await mount();
  const content = JSON.stringify(manifest);
  await edit(content); await save();
  expect(saveAdminSkillPackageManifest).not.toHaveBeenCalled();
  expect(container.querySelector("textarea")?.value).toBe(content);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("manifestInvalid");
});
test.each([
  { skills: [] },
  { skills: [{ key: "child-dir" }] },
  { skills: [{ key: "child-dir" }, { key: "中文 skill", extension: true }] },
])("allows editing declared members without duplicating display metadata: %j", async ({ skills }) => {
  await mount();
  const content = JSON.stringify({ name: "office", displayName: "Office", skills });
  await edit(content); await save();
  expect(saveAdminSkillPackageManifest).toHaveBeenCalledWith("office", content, "old-hash");
  expect(onSaved).toHaveBeenCalledTimes(1);
});

test("Platform member validation failures preserve the draft and reviewed hash", async () => {
  jest.mocked(saveAdminSkillPackageManifest).mockRejectedValueOnce(new Error("Declared member SKILL.md is missing"));
  await mount();
  const content = '{"name":"office","skills":[{"key":"missing-child"}]}';
  await edit(content); await save();
  expect(saveAdminSkillPackageManifest).toHaveBeenCalledWith("office", content, "old-hash");
  expect(container.querySelector("textarea")?.value).toBe(content);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("SKILL.md is missing");
  expect(getAdminSkillPackageManifest).toHaveBeenCalledTimes(1);
  expect(onSaved).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});
test("conflicting save preserves the draft and never retries with a fresh hash", async () => {
  jest.mocked(saveAdminSkillPackageManifest).mockRejectedValueOnce(new Error("Conflict: manifest changed"));
  await mount(); await edit('{"name":"office","skills":[{"key":"word"}],"description":"draft"}'); await save();
  expect(onClose).not.toHaveBeenCalled();
  expect(container.querySelector("textarea")?.value).toContain("draft");
  expect(getAdminSkillPackageManifest).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Conflict");
});
test("closing a dirty manifest requires explicit discard", async () => {
  await mount(); await edit('{"name":"office","skills":[{"key":"word"}],"description":"draft"}');
  await act(async () => container.querySelector<HTMLButtonElement>("section button:last-child")!.click());
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "skillPackageEditor.discard")!.click());
  expect(onClose).toHaveBeenCalledTimes(1);
});
