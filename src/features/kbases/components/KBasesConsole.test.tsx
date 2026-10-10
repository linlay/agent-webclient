/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import type { KnowledgeBase } from "@/shared/data/api/dto/kbases";
import { filesKBase, listKBases, saveKBase, searchKBase, statusKBase } from "@/shared/data/api/requests/kbases";
import { KBasesConsole } from "./KBasesConsole";
import { KBaseEditor } from "./KBaseEditor";

jest.mock("@/shared/data/api/requests/kbases", () => ({ listKBases: jest.fn(), filesKBase: jest.fn(), statusKBase: jest.fn(), saveKBase: jest.fn(), searchKBase: jest.fn(), readKBase: jest.fn(), refreshKBase: jest.fn(), deleteKBase: jest.fn() }));
jest.mock("@/shared/i18n", () => ({ t: (key: string) => key }));
const library: KnowledgeBase = { id: "docs", name: "Product documentation", description: "Guides and API references", collections: Array.from({ length: 10 }, (_, index) => ({ name: `group${index}`, sourcePath: `/demo/group${index}` })), state: "ready", createdAt: 1, updatedAt: 1, indexedAt: 1 };
const documents = library.collections.flatMap(collection => ["guide.md", "configuration.md"].map(relativePath => ({ file: `kbx://${collection.name}/${relativePath}`, collection: collection.name, relativePath, title: relativePath, bytes: 100 })));
let container: HTMLDivElement;
let root: Root;
const onClose = jest.fn();
const onSaved = jest.fn().mockResolvedValue(undefined);

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", { writable: true, value: jest.fn(() => ({ matches: false, addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn() })) });
  const original = window.getComputedStyle;
  jest.spyOn(window, "getComputedStyle").mockImplementation(element => original(element));
});
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  jest.mocked(listKBases).mockResolvedValue({ code: 0, msg: "", data: [library, { ...library, id: "other", name: "Other library" }] });
  jest.mocked(filesKBase).mockResolvedValue({ code: 0, msg: "", data: { documents, complete: true } });
  jest.mocked(statusKBase).mockResolvedValue({ code: 0, msg: "", data: { capabilities: { fullText: { available: true }, vector: { complete: true, queryModelConfigured: true }, graph: { complete: false } } } });
  jest.mocked(saveKBase).mockImplementation(async values => ({ code: 0, msg: "", data: { ...library, ...values, collections: values.collections || [], state: "unindexed", indexedAt: 0 } }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(node => node.getAttribute("aria-label") === label || node.textContent === label)!;
async function click(label: string) { await act(async () => button(label).click()); }
async function change(label: string, value: string) { await act(async () => Simulate.change(document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!, { target: { value } } as any)); }
async function mountConsole() { await act(async () => root.render(<KBasesConsole />)); }
async function mountEditor(collections = library.collections.slice(0, 2)) { await act(async () => root.render(<KBaseEditor library={{ ...library, collections }} onClose={onClose} onSaved={onSaved} />)); }

test("opens documents first and combines file search with collection filtering without expanding all sources", async () => {
  await mountConsole();
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("kbases.files");
  expect(container.textContent).not.toContain("/demo/group");
  await change("kbases.filterDocuments", "configuration");
  expect(container.querySelectorAll("tbody tr")).toHaveLength(10);
  await click("group3");
  expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(container.textContent).toContain("/demo/group3");
  expect(container.querySelector("tbody")?.textContent).toContain("configuration.md");
  await change("kbases.filter", "no-such-library");
  expect(container.textContent).toContain("kbases.noLibraries");
});

test("editing an existing library saves additions and removals in one PUT payload", async () => {
  await mountEditor();
  await click("kbases.addCollection");
  await change("kbases.collectionName 3", "notes");
  await change("kbases.source 3", "/demo/notes");
  await click("kbases.removeCollection 1");
  await click("kbases.save");
  expect(saveKBase).toHaveBeenCalledWith({ name: library.name, description: library.description, collections: [{ name: "group1", sourcePath: "/demo/group1" }, { name: "notes", sourcePath: "/demo/notes" }] }, library.id);
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("a failed collection save preserves the draft and allows correcting it", async () => {
  jest.mocked(saveKBase).mockRejectedValueOnce(new Error("Source directory is unavailable"));
  await mountEditor();
  await change("kbases.source 2", "/demo/missing");
  await click("kbases.save");
  expect(document.querySelector<HTMLInputElement>('input[aria-label="kbases.source 2"]')?.value).toBe("/demo/missing");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Source directory is unavailable");
  expect(onClose).not.toHaveBeenCalled();
});

test("collection editing keeps at least one collection and rejects duplicate names", async () => {
  await mountEditor();
  await change("kbases.collectionName 2", "group0");
  await click("kbases.save");
  expect(saveKBase).not.toHaveBeenCalled();
  // Ant Design debounces rendering the form-level error list.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
  expect(document.body.textContent).toContain("kbases.duplicateCollection");
  await click("kbases.removeCollection 2");
  expect(button("kbases.removeCollection 1").disabled).toBe(true);
});

test("switching libraries cancels an in-flight retrieval and never displays its old results", async () => {
  let finish!: (response: any) => void;
  jest.mocked(searchKBase).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await mountConsole();
  await act(async () => [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find(tab => tab.textContent === "kbases.recall")!.click());
  await change("kbases.query", "query");
  await click("kbases.search");
  const signal = jest.mocked(searchKBase).mock.calls[0][3]!;
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find(button => button.textContent?.includes("Other library"))!.click());
  expect(signal.aborted).toBe(true);
  await act(async () => finish({ code: 0, msg: "", data: { results: [] } }));
  expect(container.textContent).not.toContain("kbases.hitCount");
});


test("invalid directory diagnostics disable mutations", async () => {
 jest.mocked(listKBases).mockResolvedValue({code:0,msg:"",data:[{...library,id:"Project-Docs",invalidId:true,state:"error",indexedAt:0,error:"invalid directory ID"}]});
 await mountConsole();
 for (const label of ["kbases.edit", "kbases.update", "kbases.delete"]) expect(button(label).disabled).toBe(true);
 expect(filesKBase).not.toHaveBeenCalled();
});

test("readable libraries display source and refresh warnings without an error alert", async () => {
 jest.mocked(listKBases).mockResolvedValue({code:0,msg:"",data:[{...library,sourceWarnings:["Source offline"],refreshError:"Refresh did not start"}]});
 await mountConsole();
 expect(container.querySelectorAll(".ant-alert-warning")).toHaveLength(2);
 expect(container.querySelector(".ant-alert-error")).toBeNull();
 expect(filesKBase).toHaveBeenCalled();
 expect(button("kbases.update").disabled).toBe(false);
});


test("collection description and editable switch round-trip with source settings", async () => {
  await mountEditor([{ name: "docs", sourcePath: "/demo/docs", description: "Existing", editable: true, defaultQuery: false, exclude: [], chunk: { unit: "chars", maxChars: 3600, overlapChars: 540 } }]);
  expect(button("knowledge.collection.editable 1").getAttribute("aria-checked")).toBe("true");
  await act(async () => Simulate.change(document.querySelector<HTMLTextAreaElement>('textarea[aria-label="knowledge.collection.description 1"]')!, { target: { value: "Updated description" } } as any));
  await click("knowledge.collection.editable 1");
  await click("kbases.save");
  expect(saveKBase).toHaveBeenCalledWith(expect.objectContaining({ collections: [expect.objectContaining({ name: "docs", description: "Updated description", editable: false, defaultQuery: false, exclude: [], chunk: { unit: "chars", maxChars: 3600, overlapChars: 540 } })] }), library.id);
});


test("retrieval starts with library defaults and omits an explicit collection scope", async () => {
  jest.mocked(listKBases).mockResolvedValue({code:0,msg:"",data:[{...library,retrieval:{topK:12}}]});
  await mountConsole();
  await act(async () => [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find(tab => tab.textContent === "kbases.recall")!.click());
  expect(container.textContent).toContain("kbases.defaultCollections");
  await change("kbases.query", "query");
  await click("kbases.search");
  expect(searchKBase).toHaveBeenCalledWith(library.id, "query", 12, expect.any(AbortSignal), undefined, "query");
});
