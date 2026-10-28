/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/shared/i18n";
import { HtmlElementReviewEditor } from "./HtmlElementReviewPanel";

const pending = {
  selection: {
    fullXPath: "/html/body/div/header/h1",
    cssSelector: "html > body > div > header > h1",
    tagName: "h1",
    textExcerpt: "JSON 对比工具单文件 · 离线可用",
    rect: { x: 10, y: 20, width: 300, height: 40 },
  },
  requirement: "",
};

describe("HtmlElementReviewEditor", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: () => ({
        matches: false,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
      }),
    });
  });

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

  it("shows the requested modal layout and keeps confirm disabled for an empty requirement", async () => {
    await act(async () => {
      root.render(
        React.createElement(
          I18nProvider,
          { locale: "zh-CN", persistLocale: false },
          React.createElement(HtmlElementReviewEditor, {
            pending,
            onRequirementChange: () => undefined,
            onConfirm: () => undefined,
            onCancel: () => undefined,
          }),
        ),
      );
    });

    expect(document.body.textContent).toContain("添加批注");
    expect(document.body.textContent).toContain("Esc 关闭");
    expect(document.body.textContent).toContain("html > body > div > header > h1");
    expect(document.body.textContent).toContain("JSON 对比工具单文件 · 离线可用");
    const textarea = document.body.querySelector("textarea");
    expect(textarea?.getAttribute("placeholder")).toContain("请填写修改要求");
    const buttons = Array.from(document.body.querySelectorAll("button"));
    const confirm = buttons.find((button) => button.textContent?.replace(/\s+/g, "").includes("确认"));
    expect(confirm?.disabled).toBe(true);
  });
});
