/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ComposerContextBar } from "./ComposerContextBar";
import { useProjectGit } from "@/features/composer/hooks/useProjectGit";
import { I18nProvider } from "@/shared/i18n";

jest.mock("@/features/composer/hooks/useProjectGit", () => ({ useProjectGit: jest.fn() }));
jest.mock("@/shared/icons/agent", () => ({ AgentIcon: () => React.createElement("span") }));
jest.mock("antd", () => {
  const React = require("react");
  return {
    Popover: ({ open, onOpenChange, children, content }: any) => React.createElement("div", null,
      React.cloneElement(children, { onClick: () => onOpenChange(!open) }), open ? content : null),
    Input: React.forwardRef(({ onChange, ...props }: any, ref: any) => React.createElement("input", { ...props, ref, onChange })),
  };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const agents = [{ key: "general", name: "通用助手", workspaceDir: "/general" }, { key: "coder", name: "编程助手", workspaceDir: "/coder" }];
describe("ComposerContextBar", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onSelectAgent = jest.fn();
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    onSelectAgent.mockClear();
    jest.mocked(useProjectGit).mockReturnValue(null);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  function render(isCoder: boolean, extra: Record<string, unknown> = {}) {
    act(() => root.render(React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false, children:
      React.createElement(ComposerContextBar, { agents, currentAgentKey: isCoder ? "coder" : "general", isCoder, onSelectAgent, ...extra }),
    })));
  }
  it.each([true, false])("shows the real branch for any mode (coder=%s)", (isCoder) => {
    jest.mocked(useProjectGit).mockReturnValue({ agentKey: "demo", status: "branch", branch: "feature/actual" });
    render(isCoder, { isKbase: !isCoder });
    expect(container.textContent).toContain("feature/actual");
    expect(container.textContent).not.toContain("本地");
    jest.mocked(useProjectGit).mockReturnValue({ agentKey: "demo", status: "no_workspace" });
    render(isCoder);
    expect(container.textContent).not.toContain("feature/actual");
    expect(container.querySelector('[aria-live="polite"]')).toBeNull();
  });
  it.each(["loading", "not_repository", "no_workspace", "unavailable"] as const)("hides the entire branch item for %s", (status) => {
    jest.mocked(useProjectGit).mockReturnValue({ agentKey: "demo", status });
    render(false);
    expect(container.querySelector('[aria-live="polite"]')).toBeNull();
    expect(container.textContent).not.toContain("本地");
  });
  it("shows the actual detached HEAD", () => {
    jest.mocked(useProjectGit).mockReturnValue({ agentKey: "demo", status: "detached", commit: "1234567890abcdef" });
    render(false);
    expect(container.textContent).toContain("游离 HEAD · 12345678");
    expect(container.textContent).not.toContain("main");
  });
  it("requests the selected agent without mutating the current selection", () => {
    render(false);
    act(() => container.querySelector("button")!.click());
    const coder = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(option => option.textContent?.includes("编程助手"))!;
    act(() => coder.click());
    expect(onSelectAgent).toHaveBeenCalledWith("coder");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(container.querySelector("button")!.textContent).toContain("通用助手");
  });
  it("disables selection while blocked and when the catalog is empty", () => {
    render(false, { disabled: true });
    expect(container.querySelector("button")!.disabled).toBe(true);
    render(false, { agents: [], currentAgentKey: "", currentWorkerName: undefined });
    expect(container.querySelector("button")!.disabled).toBe(true);
    expect(container.textContent).toContain("选择智能体");
  });
  it("preserves the current team or unloaded agent label without selecting another agent", () => {
    render(false, { currentAgentKey: "", currentWorkerName: "协作团队" });
    expect(container.querySelector("button")!.textContent).toBe("协作团队");
    expect(onSelectAgent).not.toHaveBeenCalled();
  });
});
