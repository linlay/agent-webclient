/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ShareHtmlCodeBlock } from "./ShareHtmlCodeBlock";
import { copyWebText } from "@/shared/utils/webClipboard";
import type { ShareHtmlFrame } from "./ShareHtmlFrame";
type FrameProps = Parameters<typeof ShareHtmlFrame>[0];
jest.mock("antd", () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Modal: ({ open, children, onCancel }: React.PropsWithChildren<{ open: boolean; onCancel: () => void }>) => open ? <div role="dialog">{children}<button onClick={onCancel}>Close modal</button></div> : null,
}));
jest.mock("@/shared/utils/webClipboard", () => ({ copyWebText: jest.fn().mockResolvedValue(undefined) }));
jest.mock("./ShareHtmlFrame", () => ({
  ...jest.requireActual("./ShareHtmlFrame"),
  ShareHtmlFrame: ({ onStatus, onHeight }: FrameProps) => <iframe title="test preview" onLoad={() => { onHeight?.(58); onStatus("ready"); }} onClick={() => onStatus("error")} />,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement, root: Root;
const observers = new Map<Element, IntersectionObserverCallback>();
const source = '<!doctype html><html><body><nav style="height:58px">导航</nav></body></html>';
beforeEach(() => {
  Object.assign(globalThis, { IntersectionObserver: class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(element: Element) { observers.set(element, this.callback); }
    disconnect() { for (const [element, callback] of observers) if (callback === this.callback) observers.delete(element); }
  } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); observers.clear(); jest.clearAllMocks(); });
function visible(value = true) { act(() => { for (const [target, callback] of observers) callback([{ target, isIntersecting: value } as IntersectionObserverEntry], {} as IntersectionObserver); }); }
function render(text = source, done = true, count = 1) {
  act(() => root.render(<>{Array.from({ length: count }, (_, index) => <ShareHtmlCodeBlock key={index} lang="html" block
    streamStatus={done ? "done" : "loading"} sharePath="/share/test" locale="zh-CN">{text}</ShareHtmlCodeBlock>)}</>));
}
function button(label: string, scope: Element = host) { return [...scope.querySelectorAll("button")].find(button => button.textContent === label || button.getAttribute("aria-label") === label)!; }
it("defaults documents to view, preserves independent choices and releases offscreen frames", async () => {
  render(source, true, 2); expect(host.querySelectorAll("iframe")).toHaveLength(0);
  visible(); expect(host.querySelectorAll("iframe")).toHaveLength(2);
  const cards = host.querySelectorAll("[data-share-html-code]");
  act(() => button("代码",cards[0]).click());
  expect(cards[0].querySelector("iframe")).toBeNull(); expect(cards[1].querySelector("iframe")).not.toBeNull();
  render(source,true,2); expect(cards[0].querySelector('[aria-selected="true"]')?.textContent).toBe("代码");
  visible(false); expect(host.querySelectorAll("iframe")).toHaveLength(0);
  visible(true); expect(host.querySelectorAll("iframe")).toHaveLength(1);
  await act(async () => button("复制 HTML",cards[0]).click()); expect(copyWebText).toHaveBeenCalledWith(source);
});
it("requires manual preview for fragments and disables incomplete frozen code", () => {
  render('<section>fragment</section>'); visible(); expect(host.querySelector("iframe")).toBeNull();
  act(() => button("预览片段").click()); expect(host.querySelector("iframe")).not.toBeNull();
  render(source,false); expect(button("视图").disabled).toBe(true); expect(host.querySelector("iframe")).toBeNull();
  expect(host.textContent).toContain("HTML 内容不完整"); expect(host.textContent).not.toContain("正在生成");
});
it("retains 58px sizing, mounts one frame when expanded, and allows error retry", () => {
  render(); visible(); act(() => host.querySelector("iframe")!.dispatchEvent(new Event("load")));
  expect(host.querySelector('[style="height: 58px;"]')).not.toBeNull();
  act(() => button("放大预览").click()); expect(host.querySelectorAll("iframe")).toHaveLength(1);
  expect(host.querySelector('[role="dialog"] iframe')).not.toBeNull();
  act(() => button("Close modal").click()); expect(host.querySelectorAll("iframe")).toHaveLength(1);
  act(() => host.querySelector("iframe")!.click());
  expect(host.textContent).toContain("预览暂时无法加载"); expect(host.querySelector("iframe")).toBeNull();
  act(() => button("重新加载").click()); expect(host.querySelector("iframe")).not.toBeNull();
});
