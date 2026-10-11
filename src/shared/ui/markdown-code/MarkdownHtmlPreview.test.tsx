/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/shared/i18n";
import { ConversationMarkdown } from "../ConversationMarkdown";
import { ConversationMarkdownCode, type ConversationMarkdownCodeProps } from "./ConversationMarkdownCode";
import { HTML_PREVIEW_MESSAGE } from "./htmlPreviewDocument";
import * as previewDocument from "./htmlPreviewDocument";

jest.mock("antd", () => ({
  Collapse: ({ activeKey, items, onChange }: any) => <div>{items.map((item: any) => <section key={item.key}>
    <button onClick={() => onChange(activeKey === item.key ? "" : item.key)}>{item.label}</button>
    {activeKey === item.key ? item.children : null}</section>)}</div>,
  Flex: ({ children }: any) => <div>{children}</div>,
  Tooltip: ({ children }: any) => <>{children}</>,
}));

const AppCode = (props: ConversationMarkdownCodeProps) => <ConversationMarkdownCode {...props} htmlPreview />;
let root: Root;
let container: HTMLDivElement;
let unique = 0;
const observers = new Map<Element, IntersectionObserverCallback>();
const doc = () => `<!doctype html><html><body><h1>preview-${unique++}</h1></body></html>`;
const fence = (source: string, closed = true) => `\`\`\`html\n${source}${closed ? '\n```' : ''}`;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.IntersectionObserver = class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(element: Element) { observers.set(element, this.callback); }
    disconnect() { for (const [element, callback] of observers) if (callback === this.callback) observers.delete(element); }
  } as any;
  globalThis.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(element: Element) { this.callback([{ target: element, contentRect: { width: 768 } } as ResizeObserverEntry], this as any); }
    disconnect() {}
  } as any;
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); observers.clear(); jest.restoreAllMocks(); });

async function render(content: string, preview = true, isStreaming = true) {
  await act(async () => root.render(<I18nProvider locale="zh-CN" persistLocale={false}>
    <ConversationMarkdown content={content} isStreaming={isStreaming} codeComponent={preview ? AppCode : ConversationMarkdownCode} />
  </I18nProvider>));
}
async function visible(value = true) {
  await act(async () => {
    for (const [element, callback] of observers) callback([{ target: element, isIntersecting: value } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}
async function message(frame: HTMLIFrameElement, patch: Record<string, unknown>, source: MessageEventSource | null = frame.contentWindow) {
  const token = JSON.parse(frame.srcdoc.match(/const token = ("[^\n]+?");/u)![1]);
  await act(async () => window.dispatchEvent(new MessageEvent("message", { source, origin: "null", data: { type: HTML_PREVIEW_MESSAGE, token, event: "size", height: 520, ...patch } })));
}

it("waits for fence closure and visibility, then keeps iframe identity while later prose streams", async () => {
  const source = doc();
  await render(fence(source, false)); await visible();
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.textContent).toContain("HTML 数据接收中");
  expect(container.querySelector(".hljs")).toBeNull();
  await render(fence(source));
  expect(container.querySelector("iframe")).toBeNull();
  await visible();
  const frame = container.querySelector("iframe")!;
  expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
  expect(container.textContent).not.toContain("HTML 预览");
  expect(container.textContent).not.toContain("停止预览");
  const sourceDocument = frame.srcdoc;
  await render(`${fence(source)}\n\n后续内容`);
  expect(container.querySelector("iframe")).toBe(frame);
  expect(frame.srcdoc).toBe(sourceDocument);
});

it("requires manual preview for fragments and disables preview at the export/default entry", async () => {
  const source = `<section>fragment-${unique++}</section>`;
  await render(fence(source)); await visible();
  expect(container.querySelector("iframe")).toBeNull();
  const button = Array.from(container.querySelectorAll("button")).find(node => node.textContent === "显示内容")!;
  await act(async () => button.click());
  expect(container.querySelector("iframe")).not.toBeNull();
  await render(""); await render(fence(source)); await visible();
  expect(container.querySelector("iframe")).not.toBeNull();
  await render(fence(doc()), false); await visible();
  expect(container.querySelector("[data-html-preview]")).toBeNull();
});

it("validates message source and restores full content height without a ceiling", async () => {
  const source = doc(); await render(fence(source)); await visible();
  let frame = container.querySelector("iframe")!;
  const initial = frame.style.height;
  await message(frame, {}, window); expect(frame.style.height).toBe(initial);
  await message(frame, { height: Infinity }); expect(frame.style.height).toBe(initial);
  await message(frame, {}); expect(frame.style.height).toBe("520px");
  await render(""); await render(fence(source));
  expect(container.querySelector("[data-html-preview] > div:last-child")?.getAttribute("style")).toContain("520px");
  await visible(); frame = container.querySelector("iframe")!;
  await message(frame, { height: 5000 }); expect(frame.style.height).toBe("5000px");
  await message(frame, { event: "navigate" });
  expect(container.querySelector("iframe")).toBeNull();
  await render(""); await render(fence(source)); await visible();
  expect(container.querySelector("iframe")).toBeNull();
});

it("lets the user inspect source while receiving and falls back to source after interruption", async () => {
  const source = doc();
  await render(fence(source, false), true, true);
  expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  await act(async () => Array.from(container.querySelectorAll("button")).find(node => node.textContent === "html")!.click());
  expect(container.textContent).toContain("preview-");
  await render(`${fence(source, false)}\n<!-- more -->`, true, true);
  expect(container.textContent).toContain("more");
  await render(fence(source, false), true, false);
  expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.textContent).toContain("preview-");
});

it("builds only active documents and lets a waiting document take a slot", async () => {
  const build = jest.spyOn(previewDocument, "buildHtmlPreviewDocument");
  const sources = [doc(), doc(), doc()];
  await render(sources.map(source => fence(source)).join("\n\n"));
  expect(build).not.toHaveBeenCalled();
  await visible();
  expect(container.querySelectorAll("iframe")).toHaveLength(2);
  expect(build).toHaveBeenCalledTimes(2);
  const waiting = container.querySelector('[data-html-preview="idle"]')!;
  await act(async () => waiting.querySelector<HTMLButtonElement>("button")!.click());
  expect(container.querySelectorAll("iframe")).toHaveLength(2);
  expect(Array.from(container.querySelectorAll("iframe")).some(frame => frame.srcdoc.includes(sources[2].match(/preview-\d+/u)![0]))).toBe(true);
  expect(build).toHaveBeenCalledTimes(3);
  await visible(false);
  expect(container.querySelectorAll("iframe")).toHaveLength(0);
  await visible();
  expect(build).toHaveBeenCalledTimes(3);
});

it("does not parse unopened fragments and leaves source available when preparation fails", async () => {
  const build = jest.spyOn(previewDocument, "buildHtmlPreviewDocument");
  await render(fence(`<section>lazy-${unique++}</section>`)); await visible();
  expect(build).not.toHaveBeenCalled();
  build.mockReturnValueOnce(null);
  await render(fence(doc())); await visible();
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.textContent).toContain("当前环境无法显示 HTML");
  await act(async () => Array.from(container.querySelectorAll("button")).find(node => node.textContent === "html")!.click());
  expect(container.textContent).toContain("preview-");
});
