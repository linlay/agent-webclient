/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/shared/i18n";
import { awaitingStatusLabelKey } from "@/shared/i18n/awaitingStatus";
import { AwaitingStatusChip } from "./AwaitingStatusChip";
import { StatusChip } from "./StatusChip";

describe("status chip", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const render = async (node: React.ReactElement) => {
    await act(async () => root.render(
      React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false }, node),
    ));
    return container.innerHTML;
  };

  it("keeps one geometry and only varies the tone", async () => {
    const html = await render(React.createElement(StatusChip, { tone: "danger" }, "失败"));
    expect(html).toContain('data-tone="danger"');
    expect(html).toContain("失败");
    expect(container.querySelector("[aria-hidden]")).toBeNull();
  });

  it("renders the dot only when asked and pulses only with the dot", async () => {
    await render(React.createElement(StatusChip, { tone: "active" }, "运行中"));
    expect(container.querySelector("[aria-hidden]")).toBeNull();
    expect(container.firstElementChild?.hasAttribute("data-pulse")).toBe(false);

    await render(React.createElement(StatusChip, { tone: "active", dot: true, pulse: true }, "运行中"));
    expect(container.querySelector("[aria-hidden]")).not.toBeNull();
    expect(container.firstElementChild?.hasAttribute("data-pulse")).toBe(true);

    // Pulse without a dot has nothing to animate.
    await render(React.createElement(StatusChip, { tone: "active", pulse: true }, "运行中"));
    expect(container.firstElementChild?.hasAttribute("data-pulse")).toBe(false);
  });

  it("adds the shimmer sweep only for states that need the user", async () => {
    await render(React.createElement(StatusChip, { tone: "success" }, "已完成"));
    expect(container.firstElementChild?.hasAttribute("data-shimmer")).toBe(false);

    await render(React.createElement(StatusChip, { tone: "pending", shimmer: true }, "等待批准"));
    expect(container.firstElementChild?.hasAttribute("data-shimmer")).toBe(true);
  });
});

describe("awaiting status label", () => {
  it.each([
    ["plan", "leftSidebar.awaitingStatus.plan"],
    ["planning", "leftSidebar.awaitingStatus.plan"],
    ["question", "leftSidebar.awaitingStatus.question"],
    ["approval", "leftSidebar.awaitingStatus.approval"],
    ["form", "leftSidebar.awaitingStatus.form"],
  ])("maps %s to its label", (mode, key) => {
    expect(awaitingStatusLabelKey(mode)).toBe(key);
  });

  it("falls back to the generic copy for missing or unknown modes", () => {
    expect(awaitingStatusLabelKey(undefined)).toBe("leftSidebar.awaitingApproval");
    expect(awaitingStatusLabelKey("")).toBe("leftSidebar.awaitingApproval");
    expect(awaitingStatusLabelKey("mystery")).toBe("leftSidebar.awaitingApproval");
  });

  it("keeps the historical hook class and renders one label per mode", async () => {
    let root: Root;
    let container: HTMLDivElement;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(
      React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false },
        React.createElement(AwaitingStatusChip, { mode: "approval" })),
    ));
    expect(container.innerHTML).toContain("chat-awaiting-status");
    expect(container.innerHTML).toContain('data-tone="pending"');
    expect(container.innerHTML).toContain("等待批准");
    await act(async () => root.unmount());
    container.remove();
  });
});
