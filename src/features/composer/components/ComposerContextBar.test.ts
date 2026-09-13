/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ComposerContextBar } from "./ComposerContextBar";
import { I18nProvider } from "@/shared/i18n";

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
const agents = [{ key: "general", name: "通用助手" }, { key: "coder", name: "编程助手" }];
describe("ComposerContextBar", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onSelectAgent = jest.fn();
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    onSelectAgent.mockClear();
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  function render(isCoder: boolean, extra: Record<string, unknown> = {}) {
    act(() => root.render(React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false, children:
      React.createElement(ComposerContextBar, { agents, currentAgentKey: isCoder ? "coder" : "general", isCoder, onSelectAgent, ...extra }),
    })));
  }
  it("shows branch status only for CODER, including when switching away", () => {
    render(true);
    expect(container.textContent).toContain("分支未提供");
    render(false);
    expect(container.textContent).not.toContain("分支未提供");
    expect(container.textContent).toContain("本地");
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
