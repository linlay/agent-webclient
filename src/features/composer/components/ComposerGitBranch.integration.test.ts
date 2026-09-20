/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ComposerGitBranch } from "./ComposerGitBranch";
import { I18nProvider } from "@/shared/i18n";
import { projectGitCache } from "@/features/composer/lib/projectGitCache";
import { getProjectGit, getProjectGitBranches, changeProjectGitBranch } from "@/shared/data/api/routedClient";
jest.mock("@/shared/data/api/routedClient", () => ({ getProjectGit: jest.fn(), getProjectGitBranches: jest.fn(), changeProjectGitBranch: jest.fn() }));
jest.mock("antd", () => ({ Popover: ({ open, onOpenChange, children, content }: any) =>
  React.createElement("div", null, React.cloneElement(children, { onClick: () => onOpenChange(!open) }), open ? content : null) }));
it("gates by Workspace, uses list snapshots and reuses a successful mutation without an extra read", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  projectGitCache.clear();
  const container = document.createElement("div");
  const root = createRoot(container);
  const snapshot = (branch: string) => ({ agentKey: "demo", status: "branch" as const, branch, revision: branch });
  jest.mocked(getProjectGit).mockResolvedValue({ code: 0, msg: "ok", data: snapshot("main") });
  jest.mocked(getProjectGitBranches).mockResolvedValue({ code: 0, msg: "ok", data: {
    git: snapshot("external-change"), branches: ["external-change", "feature"], canChange: true,
  } });
  jest.mocked(changeProjectGitBranch).mockResolvedValue({ code: 0, msg: "ok", data: snapshot("feature") });
  const render = async (workspaceDir?: string) => {
    await act(async () => root.render(React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false,
      children: React.createElement(ComposerGitBranch, { agentKey: "demo", workspaceDir }),
    })));
  };
  try {
    await render();
    expect(getProjectGit).not.toHaveBeenCalled();
    expect(container.querySelector("button")).toBeNull();
    await render("/workspace");
    expect(container.textContent).toContain("main");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!.click());
    expect(container.querySelector('[aria-haspopup="dialog"]')?.textContent).toContain("external-change");
    const feature = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(node => node.textContent === "feature")!;
    await act(async () => feature.click());
    expect(changeProjectGitBranch).toHaveBeenCalledWith({ agentKey: "demo", operation: "switch", branch: "feature", expectedRevision: "external-change" });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain("feature");
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(getProjectGit).toHaveBeenCalledTimes(1);
    expect(getProjectGitBranches).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    projectGitCache.clear();
  }
});
