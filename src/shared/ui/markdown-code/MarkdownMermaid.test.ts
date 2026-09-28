/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import mermaid from "mermaid";
import { I18nProvider } from "@/shared/i18n";
import { MarkdownMermaid } from "./MarkdownMermaid";

// 让 mermaid 永远不落地：loading 态可以稳定停留，不依赖真实渲染输出。
// 少了 __esModule，`import mermaid from "mermaid"` 会被 interop 再包一层 default。
jest.mock("mermaid", () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(),
    parse: jest.fn(),
    render: jest.fn(),
  },
}));

const mockedParse = mermaid.parse as unknown as jest.Mock;
const mockedRender = mermaid.render as unknown as jest.Mock;

let root: Root;
let container: HTMLDivElement;

const mount = async (code: string, streamStatus?: "loading" | "done") => {
  // 必须套 I18nProvider：没有 provider 时 useI18n 每次返回新的 t，
  // 而组件的 effect 依赖里有 t，会陷入 setState 死循环。
  await act(async () => {
    root.render(
      React.createElement(
        I18nProvider,
        { locale: "zh-CN", persistLocale: false },
        React.createElement(MarkdownMermaid, { code, streamStatus }),
      ),
    );
  });
  // 流已结束时渲染延迟为 0，但 mermaid 渲染是在一个新的宏任务里进行的，
  // 要再 flush 一次才会真正出图（流式中 400ms 去抖不受影响，仍在等）。
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

beforeEach(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  // mock 是模块级共享的，必须逐用例重置，否则调用计数会跨用例累积。
  // 默认让 render 永不落地：loading 态可以稳定停留，不依赖真实渲染输出。
  mockedParse.mockReset().mockResolvedValue(true);
  mockedRender.mockReset().mockImplementation(() => new Promise(() => {}));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("renders the ink placeholder — not the text box — while a chart is loading", async () => {
  await mount("flowchart LR\nA --> B", "loading");

  const busy = container.querySelector(".markdown-mermaid-busy");
  expect(busy).not.toBeNull();
  expect(busy?.getAttribute("data-mermaid-status")).toBe("loading");
  expect(busy?.getAttribute("aria-busy")).toBe("true");
  // BusyInk 的装饰层（aria-hidden）必须真的落在占位盒里，否则只剩一句文案。
  expect(busy?.querySelector('[aria-hidden="true"]')).not.toBeNull();
  expect(container.querySelector(".markdown-mermaid-status")).toBeNull();
});

it("keeps an empty fence as a plain text box and never as ink", async () => {
  await mount("   ", "loading");

  const status = container.querySelector(".markdown-mermaid-status");
  expect(status).not.toBeNull();
  expect(status?.getAttribute("data-mermaid-status")).toBe("empty");
  expect(container.querySelector(".markdown-mermaid-busy")).toBeNull();
  expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
});

it("already resolves an empty fence on the very first frame", () => {
  // renderToStaticMarkup 不跑 effect，直接暴露 useState 初值那一帧：
  // 空的 fence 在这里就必须是 empty 文案盒，否则会先闪一帧墨流盒再被 effect 改掉。
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { locale: "zh-CN", persistLocale: false },
      React.createElement(MarkdownMermaid, { code: "   ", streamStatus: "loading" }),
    ),
  );

  expect(html).toContain("markdown-mermaid-status");
  expect(html).not.toContain("markdown-mermaid-busy");
});

it("keeps the previous chart — not the ink box — while a newer source is rendering", async () => {
  mockedRender.mockResolvedValueOnce({ svg: '<svg data-fake="1"></svg>' });
  await mount("flowchart LR\nA --> B", "done");
  expect(container.querySelector(".markdown-mermaid")).not.toBeNull();
  expect(container.querySelector(".markdown-mermaid-busy")).toBeNull();

  // 新源码到达但仍在 400ms 去抖窗口里：必须继续显示旧图（stale），
  // 不能退回墨流盒，否则就是「图 → 墨流 → 图」那一次闪。
  await mount("flowchart LR\nA --> B\nC --> D", "loading");

  const root = container.querySelector(".markdown-mermaid");
  expect(root).not.toBeNull();
  expect(root?.getAttribute("data-mermaid-status")).toBe("stale");
  expect(container.querySelector(".markdown-mermaid-busy")).toBeNull();
});

it("does not re-render mermaid when only streamStatus changed", async () => {
  mockedRender.mockResolvedValueOnce({ svg: '<svg data-fake="1"></svg>' });

  await mount("flowchart LR\nA --> B", "done");
  expect(mockedRender).toHaveBeenCalledTimes(1);

  // 源码与主题都没变，只有 streamStatus 抖动：指纹命中，不重画也不闪墨流。
  await mount("flowchart LR\nA --> B", "loading");

  expect(mockedRender).toHaveBeenCalledTimes(1);
  expect(container.querySelector(".markdown-mermaid-busy")).toBeNull();
  expect(container.querySelector(".markdown-mermaid")).not.toBeNull();
});
