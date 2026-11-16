/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { listHostDirectories } from "@/shared/data";
import { canUseDesktopFileSystemBridge, selectWorkspaceDirectory } from "@/shared/data/desktop/desktopFileSystem";
import type { KnowledgeBase } from "@/shared/data/api/dto/kbases";
import { KBaseEditor } from "./KBaseEditor";

jest.mock("@/shared/data", () => ({
  ...jest.requireActual("@/shared/data"),
  listHostDirectories: jest.fn(),
}));
jest.mock("@/shared/data/desktop/desktopFileSystem", () => ({
  canUseDesktopFileSystemBridge: jest.fn(),
  selectWorkspaceDirectory: jest.fn(),
}));
jest.mock("@/shared/data/api/requests/kbases", () => ({ saveKBase: jest.fn() }));
jest.mock("@/shared/i18n", () => ({ t: (key: string) => key }));

const library: KnowledgeBase = {
  id: "docs",
  baseRevision: "read-revision",
  name: "Docs",
  description: "",
  collections: [{ name: "", sourcePath: "" }],
  state: "unready",
  createdAt: 1,
  updatedAt: 1,
};

let container: HTMLDivElement;
let root: Root;
const onClose = jest.fn();
const onSaved = jest.fn().mockResolvedValue(undefined);

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn(() => ({
      matches: false,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  });
  const original = window.getComputedStyle;
  jest.spyOn(window, "getComputedStyle").mockImplementation((element) => original(element));
});
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function mount(native: boolean) {
  jest.mocked(canUseDesktopFileSystemBridge).mockReturnValue(native);
  await act(async () => {
    root.render(<KBaseEditor library={{ ...library, collections: [{ ...library.collections[0] }] }} onClose={onClose} onSaved={onSaved} />);
  });
}
function buttonWithText(text: string): HTMLButtonElement {
  const match = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) => node.getAttribute("aria-label") === text || node.textContent === text,
  );
  if (!match) throw new Error(`button not found: ${text}`);
  return match;
}
function inputByLabel(label: string): HTMLInputElement {
  const match = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!match) throw new Error(`input not found: ${label}`);
  return match;
}
async function click(label: string) {
  await act(async () => { buttonWithText(label).click(); });
}
async function type(label: string, value: string) {
  await act(async () => {
    Simulate.change(inputByLabel(label), { target: { value } } as any);
  });
}
function hostListing(path: string) {
  return { data: { path, parent: "/", separator: "/", entries: [], truncated: false } };
}

it("fills the source directory and an empty collection name from the Desktop picker", async () => {
  await mount(true);
  jest.mocked(selectWorkspaceDirectory).mockResolvedValue("/Users/demo/产品 文档");

  await click("kbases.selectSourceDirectory 1");
  expect(selectWorkspaceDirectory).toHaveBeenCalledTimes(1);
  expect(inputByLabel("kbases.source 1").value).toBe("/Users/demo/产品 文档");
  expect(inputByLabel("kbases.collectionName 1").value).toBe("产品-文档");
  expect(document.querySelector(".ant-message-notice")).toBeNull();
});

it("keeps a collection name the user already typed", async () => {
  await mount(true);
  await type("kbases.collectionName 1", "notes");
  jest.mocked(selectWorkspaceDirectory).mockResolvedValue("/Users/demo/reports");

  await click("kbases.selectSourceDirectory 1");
  expect(inputByLabel("kbases.source 1").value).toBe("/Users/demo/reports");
  expect(inputByLabel("kbases.collectionName 1").value).toBe("notes");
});

it("keeps the current directory when the Desktop dialog is cancelled", async () => {
  await mount(true);
  await type("kbases.source 1", "/existing/docs");
  jest.mocked(selectWorkspaceDirectory).mockResolvedValue(null);

  await click("kbases.selectSourceDirectory 1");
  expect(inputByLabel("kbases.source 1").value).toBe("/existing/docs");
  expect(document.querySelector(".ant-message-notice")).toBeNull();
});

it("reports a failed directory listing as a message instead of an inline alert", async () => {
  await mount(false);
  const pending: Array<{ resolve: (value: unknown) => void; reject: (error: Error) => void }> = [];
  jest.mocked(listHostDirectories).mockImplementation(() => new Promise((resolve, reject) => {
    pending.push({ resolve, reject });
  }) as any);

  await click("kbases.selectSourceDirectory 1");
  await act(async () => {
    pending[0].resolve({
      data: {
        path: "/srv/docs",
        parent: "/",
        separator: "/",
        entries: [{ name: "reports", path: "/srv/docs/reports" }],
        truncated: false,
      },
    });
  });

  const row = document.querySelector<HTMLElement>('[title="reports"]')?.closest("button");
  expect(row).not.toBeNull();
  await act(async () => { row!.click(); });
  await act(async () => { pending[1].reject(new Error("permission denied")); });

  expect(document.querySelector(".ant-message")?.textContent).toContain("permission denied");
  expect(document.querySelector('[role="alert"]')).toBeNull();
  // The listing left on screen belongs to another directory, so it stays unconfirmable.
  expect(buttonWithText("directoryPicker.choose").disabled).toBe(true);
});

it("browses the Platform host directories when the Desktop picker is unavailable", async () => {
  await mount(false);
  const pending: Array<{ resolve: (value: unknown) => void }> = [];
  jest.mocked(listHostDirectories).mockImplementation(() => new Promise((resolve) => {
    pending.push({ resolve });
  }) as any);

  await click("kbases.selectSourceDirectory 1");
  expect(pending).toHaveLength(1);
  await act(async () => { pending[0].resolve(hostListing("/srv/docs")); });

  // The footer confirms the listing currently on screen.
  await click("directoryPicker.choose");
  expect(inputByLabel("kbases.source 1").value).toBe("/srv/docs");
  expect(inputByLabel("kbases.collectionName 1").value).toBe("docs");
});
