/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import {
  ApiError, getAgent, getChats, getProjectTree, getProjectChanges,
  type ProjectTreeEntry, type ProjectTreeResponse,
} from "@/shared/data";
import { ProjectConsole } from "./ProjectConsole";
import type { ProjectRouteState } from "../lib/projectRoute";

jest.mock("@/shared/data", () => ({
  getAgent: jest.fn(), getChats: jest.fn(), getProjectTree: jest.fn(),
  getProjectChanges: jest.fn(), getProjectDiff: jest.fn(),
  ApiError: class extends Error {
    status: number | undefined;
    constructor(message: string, details: { status?: number } = {}) {
      super(message);
      this.status = details.status;
    }
  },
}));
jest.mock("antd", () => ({
  Spin: () => <span role="status">Loading</span>,
  Select: ({ value, options, onChange, className }: any) => (
    <select className={className} value={value || ""} onChange={(event) => onChange(event.target.value)}>
      <option value="" />
      {options.map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  ),
}));
jest.mock("@/shared/i18n", () => {
  const t = (key: string) => key;
  return { t, useI18n: () => ({ t }) };
});
jest.mock("@/shared/ui/MaterialIcon", () => ({ MaterialIcon: () => null }));
jest.mock("@/shared/ui/UiButton", () => ({
  UiButton: ({ children, variant, size, iconOnly, ...props }: any) => <button {...props}>{children}</button>,
}));
jest.mock("@/features/viewers/components/ContentViewerPanel", () => ({
  ContentViewerPanel: ({ target }: any) => <div data-preview={target.path}>{target.path}</div>,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const response = <T,>(data: T) => ({ status: 200, code: 0, msg: "success", data });
const entry = (path: string, kind: ProjectTreeEntry["kind"] = "file"): ProjectTreeEntry => ({
  name: path.split("/").pop()!, path, kind, accessible: true,
});
const tree = (entries: ProjectTreeEntry[], path = "", nextCursor?: string) => response<ProjectTreeResponse>({
  agentKey: "project", mode: "CODER", workspaceName: "Project", path,
  revision: "revision", entries, nextCursor,
});

describe("project files page", () => {
  let root: Root;
  let container: HTMLDivElement;
  const onStateChange = jest.fn();
  const rows = () => [...container.querySelectorAll<HTMLElement>(".project-tree-row")].map((row) => row.title);
  const clickRow = async (path: string) => {
    await act(async () => container.querySelector<HTMLButtonElement>(`.project-tree-row[title="${path}"]`)!.click());
  };
  const toggleHidden = async (checked: boolean) => {
    await act(async () => Simulate.change(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!, { target: { checked } } as any));
  };
  const mount = async (route: ProjectRouteState = { agentKey: "project" }) => {
    await act(async () => root.render(<ProjectConsole route={route} onStateChange={onStateChange} />));
  };

  beforeEach(() => {
    jest.mocked(getAgent).mockReset().mockResolvedValue(response({
      key: "project", name: "Project", mode: "CODER", workspaceDir: "/work/project",
      tools: [], skills: [], connectors: [], controls: [], meta: {},
    }));
    jest.mocked(getChats).mockReset().mockResolvedValue(response([]));
    jest.mocked(getProjectTree).mockReset().mockResolvedValue(tree([entry("README.md")]));
    jest.mocked(getProjectChanges).mockReset();
    onStateChange.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("removes project switching and keeps the two Chat/Run context controls", async () => {
    await mount();
    expect(container.querySelector(".project-agent-select")).toBeNull();
    expect(container.querySelector(".project-agent-cards")).toBeNull();
    expect(container.querySelectorAll("select")).toHaveLength(2);
    expect(getAgent).toHaveBeenCalledWith("project");
    expect(getChats).toHaveBeenCalledWith({ agentKey: "project", limit: 20 });
  });

  it("requires an explicit project context and offers no project picker", async () => {
    await mount({});
    expect(container.textContent).toContain("project.page.missingContext");
    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(getAgent).not.toHaveBeenCalled();
    expect(getProjectTree).not.toHaveBeenCalled();
  });

  it("toggles nested dotfiles without changing API parameters or closing their preview", async () => {
    jest.mocked(getProjectTree).mockImplementation(async ({ path }) => path === "src"
      ? tree([entry("src/.local"), entry("src/index.ts")], "src")
      : tree([entry(".git", "directory"), entry("src", "directory"), entry(".env"), entry("README.md")]));
    await mount();
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
    expect(rows()).toEqual(["src", "README.md"]);
    await clickRow("src");
    expect(rows()).toEqual(["src", "src/index.ts", "README.md"]);
    await toggleHidden(true);
    expect(rows()).toEqual([".git", "src", "src/.local", "src/index.ts", ".env", "README.md"]);
    await clickRow(".env");
    expect(container.querySelector('[data-preview=".env"]')).not.toBeNull();
    await toggleHidden(false);
    expect(rows()).not.toContain(".env");
    expect(container.querySelector('[data-preview=".env"]')).not.toBeNull();
    expect(getProjectTree).toHaveBeenCalledTimes(2);
    expect(getProjectTree).toHaveBeenNthCalledWith(1, { agentKey: "project", path: undefined, cursor: undefined, limit: 200 }, expect.anything());
  });

  it("reads past a page containing only hidden entries and retains them for the toggle", async () => {
    jest.mocked(getProjectTree)
      .mockResolvedValueOnce(tree([entry(".git", "directory")], "", "next"))
      .mockResolvedValueOnce(tree([entry("README.md")]));
    await mount();
    expect(rows()).toEqual(["README.md"]);
    expect(getProjectTree).toHaveBeenNthCalledWith(2, { agentKey: "project", path: undefined, cursor: "next", limit: 200 }, expect.anything());
    await toggleHidden(true);
    expect(rows()).toEqual([".git", "README.md"]);
  });

  it("bounds hidden-only pagination and allows loading the next batch", async () => {
    jest.mocked(getProjectTree).mockImplementation(async ({ cursor }) => {
      const page = Number(cursor || 0);
      return page < 5 ? tree([entry(`.hidden${page}`)], "", String(page + 1)) : tree([entry("visible.txt")]);
    });
    await mount();
    expect(getProjectTree).toHaveBeenCalledTimes(5);
    expect(rows()).toEqual([]);
    await act(async () => container.querySelector<HTMLButtonElement>(".project-tree-load-more")!.click());
    expect(rows()).toEqual(["visible.txt"]);
    await toggleHidden(true);
    expect(rows()).toHaveLength(6);
  });

  it("reloads from the first page when a hidden-only batch encounters a stale cursor", async () => {
    jest.mocked(getProjectTree)
      .mockResolvedValueOnce(tree([entry(".git", "directory")], "", "stale"))
      .mockRejectedValueOnce(new ApiError("directory changed", { status: 409 }))
      .mockResolvedValueOnce(tree([entry("current.txt")]));
    await mount();
    expect(rows()).toEqual(["current.txt"]);
    expect(getProjectTree).toHaveBeenCalledTimes(3);
    expect(jest.mocked(getProjectTree).mock.calls[2][0].cursor).toBeUndefined();
  });

  it("finishes a refresh with an unchanged revision without losing cached pages", async () => {
    jest.mocked(getProjectTree)
      .mockResolvedValueOnce(tree([entry(".git", "directory")], "", "next"))
      .mockResolvedValueOnce(tree([entry("README.md")]))
      .mockResolvedValueOnce(tree([entry(".git", "directory")], "", "next"));
    await mount();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="project.action.refresh"]')!.click());
    expect(container.querySelector(".project-tree-status")).toBeNull();
    expect(rows()).toEqual(["README.md"]);
    await toggleHidden(true);
    expect(rows()).toEqual([".git", "README.md"]);
  });

  it("does not accept a late directory response from a previous project", async () => {
    let resolveTree!: (value: Awaited<ReturnType<typeof getProjectTree>>) => void;
    jest.mocked(getProjectTree).mockReturnValueOnce(new Promise((resolve) => { resolveTree = resolve; }));
    await mount();
    const oldSignal = jest.mocked(getProjectTree).mock.calls[0][1]!.signal!;
    jest.mocked(getAgent).mockResolvedValue(response({
      key: "other", name: "Other", mode: "CODER", workspaceDir: "/work/other",
      tools: [], skills: [], connectors: [], controls: [], meta: {},
    }));
    await mount({ agentKey: "other" });
    await act(async () => resolveTree(tree([entry("old.txt")])));
    expect(oldSignal.aborted).toBe(true);
    expect(rows()).toEqual(["README.md"]);
  });
});
