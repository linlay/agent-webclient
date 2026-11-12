/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/shared/i18n";
import { HtmlElementReviewEditor } from "./HtmlElementReviewPanel";

const pendingBase = {
  selection: {
    fullXPath: "/html/body/div/header/h1",
    cssSelector: "html > body > div > header > h1",
    tagName: "h1",
    textExcerpt: "JSON 对比工具单文件 · 离线可用",
    rect: { x: 120, y: 340, width: 200, height: 40 },
  },
  requirement: "",
  viewportRect: { x: 120, y: 300, width: 200, height: 40 },
};

describe("HtmlElementReviewEditor", () => {
  let root: Root;
  let container: HTMLDivElement;
  let frame: HTMLIFrameElement;
  let frameRef: React.RefObject<HTMLIFrameElement>;
  let originalGetRect: typeof HTMLElement.prototype.getBoundingClientRect;

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
    // The editor height is content-driven; the card measures itself before it
    // is placed. jsdom reports 0 for every box, so give the card a real one.
    originalGetRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.getAttribute("role") === "dialog") {
        return {
          x: 0, y: 0, left: 0, top: 0, right: 320, bottom: 46,
          width: 320, height: 46, toJSON: () => ({}),
        } as DOMRect;
      }
      return originalGetRect.call(this);
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    container.getBoundingClientRect = () => ({
      left: 60,
      top: 40,
      right: 700,
      bottom: 460,
      width: 640,
      height: 420,
      x: 60,
      y: 40,
      toJSON: () => ({}),
    });
    frame = document.createElement("iframe");
    frame.getBoundingClientRect = () => ({
      left: 100,
      top: 80,
      right: 740,
      bottom: 500,
      width: 640,
      height: 420,
      x: 100,
      y: 80,
      toJSON: () => ({}),
    });
    Object.defineProperty(frame, "parentElement", {
      configurable: true,
      get: () => container,
    });
    frameRef = { current: frame };
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    HTMLElement.prototype.getBoundingClientRect = originalGetRect;
    container.remove();
    document.body.innerHTML = "";
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function renderEditor(input: {
    requirement?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  } = {}) {
    await act(async () => {
      root.render(
        React.createElement(
          I18nProvider,
          { locale: "zh-CN", persistLocale: false },
          React.createElement(HtmlElementReviewEditor, {
            pending: { ...pendingBase, requirement: input.requirement ?? "" },
            frameRef,
            onRequirementChange: () => undefined,
            onConfirm: input.onConfirm ?? (() => undefined),
            onCancel: input.onCancel ?? (() => undefined),
          }),
        ),
      );
    });
  }

  it("renders an inline editor anchored outside the element instead of a modal", async () => {
    await renderEditor();

    expect(document.body.querySelector(".ant-modal")).toBeNull();
    const editor = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(editor).not.toBeNull();
    const buttonLabels = Array.from(editor?.querySelectorAll("button") ?? [])
      .map((button) => button.getAttribute("aria-label"));
    expect(buttonLabels).toEqual(["确认", "取消"]);
    const textarea = editor?.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(textarea?.getAttribute("rows")).toBe("1");
    // frame offset (100-60, 80-40) + placement above-left of the element.
    expect(editor?.style.left).toBe("160px");
    expect(editor?.style.top).toBe("286px");
    expect(editor?.style.height).toBe("");
    expect(editor?.style.visibility).not.toBe("hidden");
  });

  it("keeps confirm disabled for an empty requirement", async () => {
    await renderEditor();

    const confirm = document.body.querySelector<HTMLButtonElement>('button[aria-label="确认"]');
    expect(confirm?.disabled).toBe(true);
  });

  it("confirms with ⌘/Ctrl + Enter and cancels with Escape", async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await renderEditor({ requirement: "把标题缩到 12 字", onConfirm, onCancel });

    const editor = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
