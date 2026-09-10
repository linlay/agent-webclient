/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/shared/i18n";
import { getDocumentPreviewCapabilities, prepareDocumentPreview } from "@/shared/data/api/requests/documentPreview";
import type { DocumentPreviewResponse } from "@/shared/data/api/dto/resources";
import type { ViewerTarget } from "../lib/viewerTarget";
import { useOnlineDocumentPreview } from "../hooks/useOnlineDocumentPreview";
import { OnlineDocumentPreview, OnlinePreviewAction } from "./OnlineDocumentPreview";
import { OnlineDocumentPreviewTab } from "./OnlineDocumentPreviewTab";
import { downloadViewerTarget } from "../lib/viewerRuntime";

jest.mock("@/shared/data/api/requests/documentPreview", () => ({ getDocumentPreviewCapabilities: jest.fn(), prepareDocumentPreview: jest.fn() }));
jest.mock("../lib/viewerRuntime", () => ({ downloadViewerTarget: jest.fn(async () => {}) }));

const target: ViewerTarget = { type: "file", agentKey: "coder", path: "report.xlsx", name: "report.xlsx", contentKind: "office" };
const response = (mode: "iframe" | "external" = "iframe"): DocumentPreviewResponse => ({
  previewId: "p1", sourceRevision: "r1", openMode: mode, url: "https://docs.example.test/s/opaque", expiresAt: Date.now() + 86400000,
});
const download = jest.fn(async () => {});

function Harness({ file = target, refresh = 0, size = 100, onReady }: {
  file?: ViewerTarget; refresh?: number; size?: number; onReady?: (result: DocumentPreviewResponse) => void;
}) {
  const preview = useOnlineDocumentPreview({ target: file, chatId: "chat-1", name: file.name, sizeBytes: size, refreshKey: refresh, onReady });
  return preview.result ? React.createElement(OnlineDocumentPreview, { preview, name: file.name, onDownload: download }) : React.createElement(OnlinePreviewAction, { preview });
}

describe("online document preview", () => {
  let root: Root, container: HTMLDivElement;
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    jest.mocked(getDocumentPreviewCapabilities).mockResolvedValue({ code: 0, data: { enabled: true, supportedExtensions: ["docx", "pptx", "xlsx"], maxFileBytes: 1000, openMode: "iframe" } } as never);
    jest.mocked(prepareDocumentPreview).mockResolvedValue({ code: 0, data: response() } as never);
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.useRealTimers(); });
  async function render(props: React.ComponentProps<typeof Harness> = {}) {
    await act(async () => root.render(React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false }, React.createElement(Harness, props))));
  }
  async function click(text: string) {
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.replace(/\s/g, "") === text);
    expect(button).toBeDefined(); await act(async () => button!.click());
  }

  it("only uploads after a click and embeds the returned readonly share URL", async () => {
    await render(); expect(prepareDocumentPreview).not.toHaveBeenCalled();
    await click("在线预览");
    expect(prepareDocumentPreview).toHaveBeenCalledWith({ requestId: expect.any(String), source: { kind: "workspace-file", agentKey: "coder", path: "report.xlsx" } }, expect.any(AbortSignal));
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe(response().url);
    expect(container.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
    expect(container.querySelector("a")?.rel).toBe("noopener noreferrer");
    await click("返回文件"); expect(container.querySelector("iframe")).toBeNull();
  });

  it("external mode provides an explicit link without embedding or automatic popups", async () => {
    jest.mocked(prepareDocumentPreview).mockResolvedValue({ data: response("external") } as never);
    await render(); await click("在线预览");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("a")?.textContent).toBe("打开在线预览");
    expect(container.querySelector("a")?.target).toBe("_blank");
  });

  it("hands off the prepared link without replacing the original file", async () => {
    const onReady = jest.fn();
    await render({ onReady }); await click("在线预览");
    expect(onReady).toHaveBeenCalledWith(expect.objectContaining({ previewId: "p1" }));
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).toBe("在线预览");
  });

  it("does not open a tab for a response received after the source has closed", async () => {
    const onReady = jest.fn();
    let finish!: (value: any) => void;
    jest.mocked(prepareDocumentPreview).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await render({ onReady }); await click("在线预览");
    const signal = jest.mocked(prepareDocumentPreview).mock.calls[0][1]!;
    await act(async () => root.render(null));
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ data: response() }));
    expect(onReady).not.toHaveBeenCalled();
  });

  it("a separate tab keeps its source for reload and download and can recover from reload failure", async () => {
    const onBack = jest.fn();
    await act(async () => root.render(React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false },
      React.createElement(OnlineDocumentPreviewTab, {
        tab: { key: "source-key", target, chatId: "owner-chat", teamChat: true, result: response() }, onBack,
      }))));
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe(response().url);
    expect(prepareDocumentPreview).not.toHaveBeenCalled();
    await click("返回文件"); expect(onBack).toHaveBeenCalledTimes(1);
    await click("下载");
    expect(downloadViewerTarget).toHaveBeenCalledWith(target, { chatId: "owner-chat", teamChat: true });

    jest.mocked(prepareDocumentPreview).mockRejectedValueOnce(new Error("服务不可用"));
    await click("重新加载");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("服务不可用");
    jest.mocked(prepareDocumentPreview).mockResolvedValue({ data: { ...response(), sourceRevision: "r2", url: "https://docs.example.test/s/updated" } } as never);
    await click("在线预览");
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe("https://docs.example.test/s/updated");
    expect(jest.mocked(prepareDocumentPreview).mock.calls[1][0].source).toEqual({ kind: "workspace-file", agentKey: "coder", path: "report.xlsx" });
  });

  it("aborts on file switch and ignores a late successful response", async () => {
    let finish!: (value: any) => void;
    jest.mocked(prepareDocumentPreview).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await render(); await click("在线预览");
    const signal = jest.mocked(prepareDocumentPreview).mock.calls[0][1]!;
    await render({ file: { ...target, path: "other.xlsx", name: "other.xlsx" } });
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ data: response() }));
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("refresh clears an existing preview and sends a new request ID", async () => {
    await render(); await click("在线预览");
    const first = jest.mocked(prepareDocumentPreview).mock.calls[0][0].requestId;
    await render({ refresh: 1 }); expect(container.querySelector("iframe")).toBeNull();
    await click("在线预览");
    expect(jest.mocked(prepareDocumentPreview).mock.calls[1][0].requestId).not.toBe(first);
  });

  it("reload rechecks the source and replaces the old document revision", async () => {
    await render(); await click("在线预览");
    const first = jest.mocked(prepareDocumentPreview).mock.calls[0][0].requestId;
    jest.mocked(prepareDocumentPreview).mockResolvedValue({ data: { ...response(), sourceRevision: "r2", url: "https://docs.example.test/s/updated" } } as never);
    await click("重新加载");
    expect(jest.mocked(prepareDocumentPreview).mock.calls[1][0].requestId).not.toBe(first);
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe("https://docs.example.test/s/updated");
  });

  it("explains unavailable services and excessive size without uploading", async () => {
    await render({ size: 1001 }); expect(container.textContent).toContain("文件超过在线预览大小限制");
    expect(container.querySelector("button")?.disabled).toBe(true);
    jest.mocked(getDocumentPreviewCapabilities).mockRejectedValue(new Error("404"));
    await render({ refresh: 1 }); expect(container.textContent).toContain("未配置在线预览服务");
    expect(prepareDocumentPreview).not.toHaveBeenCalled();
  });

  it("shows failures and retries only on another user click", async () => {
    jest.mocked(prepareDocumentPreview).mockRejectedValueOnce(new Error("上传结果未知"));
    await render(); await click("在线预览");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("上传结果未知");
    expect(prepareDocumentPreview).toHaveBeenCalledTimes(1);
    await click("在线预览"); expect(container.querySelector("iframe")).not.toBeNull();
  });

  it("unmounts expired iframe and requires a new preview request", async () => {
    jest.useFakeTimers();
    jest.mocked(prepareDocumentPreview).mockResolvedValue({ data: { ...response(), expiresAt: Date.now() + 1000 } } as never);
    await render(); await click("在线预览");
    await act(async () => jest.advanceTimersByTime(1001));
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).toContain("预览链接已过期");
    jest.mocked(prepareDocumentPreview).mockResolvedValue({ data: response() } as never);
    await click("重新获取预览"); expect(prepareDocumentPreview).toHaveBeenCalledTimes(2);
  });
});
