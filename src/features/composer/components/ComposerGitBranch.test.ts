/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ComposerGitBranch } from "./ComposerGitBranch";
import { I18nProvider } from "@/shared/i18n";
import { useProjectGit } from "@/features/composer/hooks/useProjectGit";
import { getProjectGitBranches, changeProjectGitBranch } from "@/shared/data/api/requests/projects";

jest.mock("@/features/composer/hooks/useProjectGit", () => ({ useProjectGit: jest.fn() }));
jest.mock("@/shared/data/api/requests/projects", () => ({ getProjectGitBranches: jest.fn(), changeProjectGitBranch: jest.fn() }));
jest.mock("antd", () => ({ Popover: ({ open, onOpenChange, children, content }: any) =>
  React.createElement("div", null, React.cloneElement(children, { onClick: () => onOpenChange(!open) }), open ? content : null) }));
let root: Root;
let container: HTMLDivElement;
const snapshot = (agentKey = "demo", branch = "base") => ({ agentKey, status: "branch" as const, branch, revision: "observed-revision" });
const listing = (agentKey = "demo") => ({ code: 0, msg: "ok", data: { git: snapshot(agentKey), branches: ["base", "feature"], canChange: true } });
function button(text: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(node => node.textContent === text)!;
}
async function render(agentKey = "demo") {
  await act(async () => root.render(React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false, children:
    React.createElement(ComposerGitBranch, { key: agentKey, agentKey }),
  })));
}
async function open() { await act(async () => container.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!.click()); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  jest.clearAllMocks();
  jest.mocked(useProjectGit).mockReturnValue(snapshot());
  jest.mocked(getProjectGitBranches).mockImplementation(async key => listing(key));
  jest.mocked(changeProjectGitBranch).mockImplementation(async request => ({ code: 0, msg: "ok", data: snapshot(request.agentKey, request.branch) }));
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
it("loads branches only on opening and switches with the observed revision", async () => {
  await render(); expect(getProjectGitBranches).not.toHaveBeenCalled();
  await open(); expect(button("base").disabled).toBe(true);
  await act(async () => button("feature").click());
  expect(changeProjectGitBranch).toHaveBeenCalledWith({ agentKey: "demo", operation: "switch", branch: "feature", expectedRevision: "observed-revision" });
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(jest.mocked(useProjectGit).mock.calls.at(-1)?.[2]).toBe(1);
});
it("creates and switches from the explicit new branch form", async () => {
  await render(); await open();
  await act(async () => {
    const input = container.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "feature/new");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("新建并切换").click());
  expect(changeProjectGitBranch).toHaveBeenCalledWith(expect.objectContaining({ operation: "create", branch: "feature/new" }));
});
it("prevents duplicate mutations and shows Git refusal without closing the menu", async () => {
  let reject!: (error: Error) => void;
  jest.mocked(changeProjectGitBranch).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  await render(); await open();
  await act(async () => { button("feature").click(); button("feature").click(); });
  expect(changeProjectGitBranch).toHaveBeenCalledTimes(1);
  expect(button("处理中…").disabled).toBe(true);
  await act(async () => reject(new Error("local changes would be overwritten")));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("local changes would be overwritten");
  expect(getProjectGitBranches).toHaveBeenCalledTimes(2);
});
it("does not allow a read-only project to mutate and explains the boundary", async () => {
  jest.mocked(getProjectGitBranches).mockResolvedValueOnce({ ...listing(), data: { ...listing().data, canChange: false, blockedReason: "workspace_not_repo_root" } });
  await render(); await open();
  expect(container.textContent).toContain("仓库子目录");
  expect(button("feature").disabled).toBe(true);
  await act(async () => button("feature").click());
  expect(changeProjectGitBranch).not.toHaveBeenCalled();
});
it("clears the previous agent menu and ignores its late mutation response", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof changeProjectGitBranch>>) => void;
  jest.mocked(changeProjectGitBranch).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await render(); await open(); await act(async () => button("feature").click());
  await render("other");
  await act(async () => resolve({ code: 0, msg: "ok", data: snapshot("demo", "feature") }));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  await open();
  expect(getProjectGitBranches).toHaveBeenLastCalledWith("other", expect.anything());
});
it("rejects a mismatched list response without enabling actions", async () => {
  jest.mocked(getProjectGitBranches).mockResolvedValueOnce(listing("wrong"));
  await render(); await open();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(button("新建并切换").disabled).toBe(true);
});
