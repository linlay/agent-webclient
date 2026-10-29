/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/shared/i18n";
import { HtmlElementReviewToolbar } from "./HtmlElementReviewToolbar";

describe("HtmlElementReviewToolbar", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function render(listOpen: boolean) {
    await act(async () => {
      root.render(
        React.createElement(
          I18nProvider,
          { locale: "zh-CN", persistLocale: false },
          React.createElement(HtmlElementReviewToolbar, {
            listOpen,
            count: 2,
            onBack: () => undefined,
            onToggleList: () => undefined,
            onRefresh: () => undefined,
            listContent: React.createElement("div", null, "LIST-CONTENT"),
          }),
        ),
      );
    });
  }

  it("keeps the count button and icon-only refresh together", async () => {
    await render(false);
    expect(container.textContent).toMatch(/批\s*注 2\/50/);
    expect(container.querySelector("button[aria-label]")?.getAttribute("aria-label")).toContain("刷新");
    expect(container.textContent).not.toContain("刷新");
  });

  it("shows the list content in a controlled popover when open", async () => {
    await render(true);
    expect(document.body.textContent).toContain("LIST-CONTENT");
  });
});
