/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/shared/i18n";

jest.mock("@/shared/ui/CodeEditor", () => ({
  CodeEditor: () => null,
}));

import { DocumentTextEditor } from "./DocumentTextEditor";

describe("DocumentTextEditor HTML element review entry", () => {
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
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function render() {
    await act(async () => {
      root.render(
        React.createElement(
          I18nProvider,
          { locale: "zh-CN", persistLocale: false },
          React.createElement(DocumentTextEditor, {
            value: "<!doctype html><html><body><h2>标题</h2></body></html>",
            name: "report.html",
            kind: "document-html",
            chatId: "chat-1",
            teamChat: false,
            saveProfile: "artifact",
            revision: "rev-1",
            onChange: () => undefined,
            onReload: () => undefined,
            onSave: () => undefined,
          }),
        ),
      );
    });
  }

  it("keeps source and split but injects the element review bridge into preview", async () => {
    await render();
    expect(container.textContent).toMatch(/预\s*览/);
    expect(container.textContent).toContain("源码");
    expect(container.textContent).toContain("分屏");
    expect(container.textContent).toMatch(/批\s*注/);

    const frame = container.querySelector("iframe");
    expect(frame).not.toBeNull();
    const srcDoc = frame?.getAttribute("srcdoc") || "";
    expect(srcDoc).toContain("__agent_webclient_html_review_overlay__");
    expect(srcDoc).toContain("html-element-review");
    expect(srcDoc).toContain("<!doctype html>");
  });
});
