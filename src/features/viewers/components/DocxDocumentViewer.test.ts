/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TextDecoder, TextEncoder } from "node:util";
import JSZip from "jszip";
import { DocxDocumentViewer } from "./DocxDocumentViewer";
import { getResourceBlob } from "@/shared/data";
import { I18nProvider } from "@/shared/i18n";

jest.mock("@/shared/data", () => ({ getResourceBlob: jest.fn() }));
jest.mock("@/features/viewers/lib/docxPreviewAssets", () => ({ docxPreviewAssets: { zip: "/zip.js", docx: "/docx.js" } }));

describe("Word preview lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onDownload = jest.fn(async () => {});
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, TextDecoder, TextEncoder });
    jest.clearAllMocks();
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file("word/document.xml", "<document/>");
    const data = await zip.generateAsync({ type: "arraybuffer" });
    jest.mocked(getResourceBlob).mockResolvedValue({ size: data.byteLength, arrayBuffer: async () => data } as Blob);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  });
  async function render() {
    await act(async () => root.render(React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false },
      React.createElement(DocxDocumentViewer, { url: "申请表.docx", name: "申请表.docx", chatId: "uploaded-chat", onDownload }))));
  }
  async function frameMessage(state: string, extra: Record<string, unknown> = {}, forged = false) {
    const frame = container.querySelector("iframe")!;
    const token = /nonce="([^"]+)"/.exec(frame.srcdoc)![1];
    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", { source: forged ? window : frame.contentWindow!, data: { type: "docx-preview", token, state, ...extra } }));
    });
    return frame;
  }

  it("sends authenticated bytes to an isolated frame and downloads only on request", async () => {
    await render();
    const frame = container.querySelector("iframe")!;
    const send = jest.spyOn(frame.contentWindow!, "postMessage");
    await frameMessage("ready");
    expect(getResourceBlob).toHaveBeenCalledWith("申请表.docx", expect.objectContaining({ chatId: "uploaded-chat", signal: expect.any(AbortSignal) }));
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.srcdoc).toContain("default-src 'none'");
    expect(frame.srcdoc).toContain("renderAltChunks: false");
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ action: "render", data: expect.objectContaining({ byteLength: expect.any(Number) }) }), "*", expect.any(Array));
    await frameMessage("rendered", { pages: 2 });
    expect(container.textContent).toContain("1 / 2");
    expect(onDownload).not.toHaveBeenCalled();
    const download = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "下载原文件")!;
    await act(async () => download.click());
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it("ignores spoofed frame messages and renders a missing-file error with retry", async () => {
    jest.mocked(getResourceBlob).mockRejectedValueOnce(Object.assign(new Error("missing"), { status: 404 }));
    await render();
    await frameMessage("ready", {}, true);
    expect(getResourceBlob).not.toHaveBeenCalled();
    await frameMessage("ready");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("该文件已不存在");
    expect(onDownload).not.toHaveBeenCalled();
    const oldFrame = container.querySelector("iframe");
    const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "重试")!;
    await act(async () => retry.click());
    expect(container.querySelector("iframe")).not.toBe(oldFrame);
    await frameMessage("ready");
    await frameMessage("rendered", { pages: 1 });
    expect(container.textContent).toContain("1 / 1");
  });

  it("aborts loading on close and ignores a late resource response", async () => {
    let complete!: (value: Blob) => void;
    jest.mocked(getResourceBlob).mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    await render();
    const frame = await frameMessage("ready");
    const send = jest.spyOn(frame.contentWindow!, "postMessage");
    const signal = jest.mocked(getResourceBlob).mock.calls[0][1]!.signal!;
    await act(async () => root.render(null));
    expect(signal.aborted).toBe(true);
    await act(async () => complete({ size: 0 } as Blob));
    expect(send).not.toHaveBeenCalled();
  });
});
