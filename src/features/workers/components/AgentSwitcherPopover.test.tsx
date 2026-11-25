/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConfigProvider } from "antd";
import { AgentSwitcherPopover } from "./AgentSwitcherPopover";
import type { TimelineAgentOption } from "../lib/agentSelection";

jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/shared/icons/agent", () => ({ AgentIcon: () => React.createElement("span") }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const options: TimelineAgentOption[] = [
  { key: "general", name: "通用助手", role: "", hideRole: true, searchText: "通用助手 general" },
  { key: "coder", name: "编程助手", role: "CODER", searchText: "编程助手 coder" },
];

describe("AgentSwitcherPopover", () => {
  let host: HTMLDivElement;
  let root: Root;
  const select = jest.fn();

  beforeEach(() => {
    select.mockClear();
    window.matchMedia = jest.fn().mockImplementation(() => ({
      matches: false,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));
    host = document.createElement("div");
    host.className = "layout-mobile";
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    window.history.replaceState({}, "", "/");
  });

  function render() {
    act(() => {
      root.render(
        <ConfigProvider theme={{ token: { motion: false } }}>
          <AgentSwitcherPopover
            currentWorker={{ type: "agent", sourceId: "general", displayName: "通用助手" }}
            options={options}
            containerClassName="switcher"
            onSelectAgent={select}
            renderTrigger={(open) => (
              <button type="button" data-testid="trigger" aria-expanded={open}>
                通用助手
              </button>
            )}
          />
        </ConfigProvider>,
      );
    });
  }

  async function openTrigger() {
    render();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="trigger"]')!.click();
    });
  }

  it("opens the shared headerless bottom sheet on mobile", async () => {
    window.history.replaceState({}, "", "/mobile");
    await openTrigger();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    // 面板不画标题栏：关闭交给遮罩、Esc 与下拉手势。
    expect(document.querySelector(".ant-drawer-header")).toBeNull();
    expect(document.querySelector(".ant-drawer-title")).toBeNull();
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe("composer.context.selectAgent");
    expect(dialog.textContent).toContain("通用助手");
    expect(dialog.textContent).toContain("编程助手");
  });

  it("selects an agent from the mobile sheet and closes it", async () => {
    window.history.replaceState({}, "", "/mobile");
    await openTrigger();

    const coder = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]'))
      .find((option) => option.textContent?.includes("编程助手"))!;
    await act(async () => coder.click());

    expect(select).toHaveBeenCalledWith("coder");
  });

  it("keeps the anchored popover on desktop", async () => {
    await openTrigger();

    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(document.querySelector(".ant-drawer")).toBeNull();
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  });
});
