/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ContentViewerPanel } from "./ContentViewerPanel";
import { DocumentTextEditor } from "./DocumentTextEditor";
import { canUseDesktopCurrentResourceActions, checkDesktopCurrentResourceActionsAvailable, requestDesktopCurrentResourceAction } from "@/shared/data/desktop/desktopCurrentResourceAction";
import { isAppMode, isDesktopAppMode } from "@/shared/utils/routing";
import { getDesktopDocumentOpenOptions, openDesktopDocumentInLocalApp } from "../lib/desktopDocumentOpen";
import { getAgentFile } from "@/shared/data";
import { downloadViewerTarget, openStandaloneViewerTarget, readViewerResourceMetadata, readViewerResourceDocument } from "@/features/viewers/lib/viewerRuntime";
import type { ViewerTarget } from "@/features/viewers/lib/viewerTarget";
import { canUseStandaloneFileActions, getStandaloneFileCapabilities } from "@/shared/data/standalone/standaloneFileActions";
import { useAuthenticatedResourceUrl } from "@/shared/ui/useAuthenticatedResourceUrl";
import { I18nProvider } from "@/shared/i18n";
import { getDocumentPreviewCapabilities, prepareDocumentPreview } from "@/shared/data/api/requests/documentPreview";

jest.mock("@/shared/data/desktop/desktopCurrentResourceAction", () => ({
  ...jest.requireActual("@/shared/data/desktop/desktopCurrentResourceAction"),
  canUseDesktopCurrentResourceActions: jest.fn(() => false),
  checkDesktopCurrentResourceActionsAvailable: jest.fn(async () => true),
  requestDesktopCurrentResourceAction: jest.fn(async () => ({ ok: true })),
}));
jest.mock("@/shared/utils/routing", () => ({ ...jest.requireActual("@/shared/utils/routing"), isAppMode: jest.fn(() => false), isDesktopAppMode: jest.fn(() => false) }));
jest.mock("../lib/desktopDocumentOpen", () => ({
  ...jest.requireActual("../lib/desktopDocumentOpen"),
  getDesktopDocumentOpenOptions: jest.fn(), openDesktopDocumentInLocalApp: jest.fn(),
}));
jest.mock("@/app/state/AppContext", () => ({ useAppState: () => ({ chatId: "chat-1", chats: [] }) }));
jest.mock("@/shared/data", () => ({ getAgentFile: jest.fn() }));
jest.mock("@/shared/ui/useAuthenticatedResourceUrl", () => ({ useAuthenticatedResourceUrl: jest.fn(() => ({ url: "", loading: false, error: null })) }));
jest.mock("@/shared/data/api/requests/documentPreview", () => ({ getDocumentPreviewCapabilities: jest.fn(async () => ({ data: { enabled: false } })), prepareDocumentPreview: jest.fn() }));
jest.mock("./DocumentTextEditor", () => ({ DocumentTextEditor: jest.fn(() => null) }));
jest.mock("./BrowserImageEditor", () => ({ BrowserImageEditor: () => null }));
jest.mock("@/features/viewers/lib/viewerRuntime", () => ({
  downloadViewerTarget: jest.fn(), openStandaloneViewerTarget: jest.fn(), readViewerResourceMetadata: jest.fn(), readViewerResourceDocument: jest.fn(),
}));
jest.mock("@/shared/data/standalone/standaloneFileActions", () => ({
  canUseStandaloneFileActions: jest.fn(), getStandaloneFileCapabilities: jest.fn(),
}));

const target: ViewerTarget = {
  type: "resource", name: "项目立项建议书.doc", url: "artifacts/report.doc",
  downloadUrl: "artifacts/report.doc", contentKind: "office",
  source: { kind: "artifact", agentKey: "agent-1", chatId: "chat-1", resourceId: "artifact-1", relativePath: "artifacts/report.doc" },
};
const capabilities = { token: "token", platform: "darwin" as const, maxBytes: 1024 };

describe("standalone document panel", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    jest.mocked(isAppMode).mockReturnValue(false);
    jest.mocked(isDesktopAppMode).mockReturnValue(false);
    jest.mocked(getDesktopDocumentOpenOptions).mockResolvedValue({ available: true, applications: [{ id: "app-word", name: "Microsoft Word", isDefault: true }] });
    jest.mocked(openDesktopDocumentInLocalApp).mockResolvedValue({ ok: true, status: "launch-requested" });
    jest.mocked(canUseDesktopCurrentResourceActions).mockReturnValue(false);
    jest.mocked(canUseStandaloneFileActions).mockReturnValue(true);
    jest.mocked(useAuthenticatedResourceUrl).mockReturnValue({ url: "", loading: false, error: null });
    jest.mocked(getStandaloneFileCapabilities).mockResolvedValue(capabilities);
    jest.mocked(readViewerResourceMetadata).mockResolvedValue({ documentKind: "document-office", mimeType: "application/test", sizeBytes: 36800 } as never);
    jest.mocked(openStandaloneViewerTarget).mockResolvedValue(undefined);
    jest.mocked(downloadViewerTarget).mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    jest.restoreAllMocks();
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  });
  async function render(refreshRequest = 0, nextTarget = target) {
    await act(async () => root.render(React.createElement(
      I18nProvider, { locale: "zh-CN", persistLocale: false },
      React.createElement(ContentViewerPanel, { target: nextTarget, refreshRequest }),
    )));
  }

  it.each(["MacIntel", "Win32"])("keeps Desktop actions in the card and uses the host bridge on %s", async (platform) => {
    jest.spyOn(window.navigator, "platform", "get").mockReturnValue(platform);
    jest.spyOn(window.navigator, "userAgent", "get").mockReturnValue(platform === "MacIntel" ? "Mozilla/5.0 (Macintosh)" : "Mozilla/5.0 (Windows NT 10.0)");
    jest.mocked(isAppMode).mockReturnValue(true);
    jest.mocked(isDesktopAppMode).mockReturnValue(true);
    jest.mocked(canUseDesktopCurrentResourceActions).mockReturnValue(true);
    await act(async () => root.render(React.createElement(
      I18nProvider, { locale: "zh-CN", persistLocale: false },
      React.createElement(ContentViewerPanel, { target, enableDesktopLocalResourceActions: true }),
    )));
    const card = container.querySelector("section")!;
    const buttons = Array.from(card.querySelectorAll("button"));
    expect(buttons).toHaveLength(4);
    expect(container.querySelectorAll("button")).toHaveLength(4);
    expect(buttons.map((button) => button.textContent)).toEqual([
      "在线预览", "用 Word 打开", "下载", platform === "MacIntel" ? "在访达中显示" : "在文件资源管理器中显示",
    ]);
    expect(buttons.filter((button) => button.textContent === "在线预览")).toHaveLength(1);
    expect(buttons[1].compareDocumentPosition(buttons[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(buttons[2].parentElement?.textContent).not.toContain("在线预览");
    expect(buttons[2].parentElement?.contains(buttons[3])).toBe(true);
    expect(card.querySelector("details")).not.toBeNull();
    expect(buttons[2].compareDocumentPosition(card.querySelector("details")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.textContent).not.toContain("另存");
    expect(card.textContent).not.toContain("副本");
    expect(checkDesktopCurrentResourceActionsAvailable).toHaveBeenCalled();
    expect(getStandaloneFileCapabilities).not.toHaveBeenCalled();
    await act(async () => buttons[3].click());
    expect(requestDesktopCurrentResourceAction).toHaveBeenLastCalledWith("reveal", {
      chatId: "chat-1", profile: "artifact", relativePath: "artifacts/report.doc",
    });
    await act(async () => buttons[1].click());
    expect(openDesktopDocumentInLocalApp).toHaveBeenCalledWith(target.source, "app-word");
    expect(requestDesktopCurrentResourceAction).not.toHaveBeenCalledWith("open-default", expect.anything());
    expect(openStandaloneViewerTarget).not.toHaveBeenCalled();
    expect(downloadViewerTarget).not.toHaveBeenCalled();
  });

  it("preserves default opening on an older Desktop without direct-open capability", async () => {
    jest.mocked(isAppMode).mockReturnValue(true);
    jest.mocked(isDesktopAppMode).mockReturnValue(true);
    jest.mocked(canUseDesktopCurrentResourceActions).mockReturnValue(true);
    jest.mocked(getDesktopDocumentOpenOptions).mockResolvedValue({ available: false });
    await act(async () => root.render(React.createElement(
      I18nProvider, { locale: "zh-CN", persistLocale: false },
      React.createElement(ContentViewerPanel, { target, enableDesktopLocalResourceActions: true }),
    )));
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual([
      "在线预览", "用默认应用打开", "下载", "在访达中显示",
    ]);
    await act(async () => buttons[1].click());
    expect(requestDesktopCurrentResourceAction).toHaveBeenCalledWith("open-default", {
      chatId: "chat-1", profile: "artifact", relativePath: "artifacts/report.doc",
    });
    expect(openDesktopDocumentInLocalApp).not.toHaveBeenCalled();
    expect(openStandaloneViewerTarget).not.toHaveBeenCalled();
  });

  it("does not offer a default fallback when neither Desktop capability is available", async () => {
    jest.mocked(isAppMode).mockReturnValue(true);
    jest.mocked(isDesktopAppMode).mockReturnValue(true);
    jest.mocked(getDesktopDocumentOpenOptions).mockResolvedValue({ available: false });
    await render();
    expect(Array.from(container.querySelectorAll("button")).map((button) => button.textContent))
      .toEqual(["在线预览", "下载"]);
    expect(container.querySelector("details")).not.toBeNull();
  });

  it("opens a workspace Office file directly without a Resource Viewer identity", async () => {
    jest.mocked(isAppMode).mockReturnValue(true);
    jest.mocked(isDesktopAppMode).mockReturnValue(true);
    const file: ViewerTarget = { type: "file", agentKey: "coder", path: "预算.xlsx", name: "预算.xlsx", contentKind: "office" };
    jest.mocked(getAgentFile).mockResolvedValue({ data: {
      agentKey: "coder", requestedPath: file.path, path: file.path, name: file.name,
      contentKind: "binary", documentKind: "document-office", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 1000,
    } } as never);
    jest.mocked(getDesktopDocumentOpenOptions).mockResolvedValue({ available: true, applications: [{ id: "app-excel", name: "Microsoft Excel", isDefault: true }] });
    await render(0, file);
    const button = Array.from(container.querySelectorAll("button")).find((entry) => entry.textContent === "用 Excel 打开");
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(openDesktopDocumentInLocalApp).toHaveBeenCalledWith({ kind: "workspace-file", agentKey: "coder", path: "预算.xlsx" }, "app-excel");
    expect(checkDesktopCurrentResourceActionsAvailable).not.toHaveBeenCalled();
    expect(requestDesktopCurrentResourceAction).not.toHaveBeenCalled();
    expect(getStandaloneFileCapabilities).not.toHaveBeenCalled();
  });

  it.each(["workspace", "reference"] as const)("shows the %s PDF preview without a local-app toolbar in Desktop", async (kind) => {
    jest.mocked(isAppMode).mockReturnValue(true);
    jest.mocked(isDesktopAppMode).mockReturnValue(true);
    const reference = { kind: "reference" as const, agentKey: "coder", chatId: "chat-1", resourceId: "pdf-reference", relativePath: "guide.pdf" };
    const file: ViewerTarget = kind === "workspace"
      ? { type: "file", agentKey: "coder", path: "guide.pdf", name: "guide.pdf", contentKind: "pdf" }
      : { type: "resource", name: "guide.pdf", url: "guide.pdf", downloadUrl: "guide.pdf", contentKind: "pdf", source: reference };
    jest.mocked(getAgentFile).mockResolvedValue({ data: {
      agentKey: "coder", requestedPath: "guide.pdf", path: "guide.pdf", name: "guide.pdf", contentKind: "binary", documentKind: "document-pdf", mimeType: "application/pdf",
    } } as never);
    jest.mocked(readViewerResourceMetadata).mockResolvedValue({ documentKind: "document-pdf", mimeType: "application/pdf" } as never);
    jest.mocked(useAuthenticatedResourceUrl).mockReturnValue({ url: "blob:pdf-preview", loading: false, error: null });
    jest.mocked(getDesktopDocumentOpenOptions).mockResolvedValue({ available: true, applications: [{ id: "app-preview", name: "预览", isDefault: true }] });
    await render(0, file);
    const preview = container.querySelector('iframe[title="guide.pdf"]');
    expect(preview?.getAttribute("src")).toBe("blob:pdf-preview");
    expect(container.querySelector("section")).toBeNull();
    const button = Array.from(container.querySelectorAll("button")).find((entry) => entry.textContent === "用 预览 打开");
    expect(button).toBeUndefined();
    expect(getDesktopDocumentOpenOptions).not.toHaveBeenCalled();
    expect(openDesktopDocumentInLocalApp).not.toHaveBeenCalled();
    expect(requestDesktopCurrentResourceAction).not.toHaveBeenCalled();
    expect(downloadViewerTarget).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("在线预览");
  });

  it("retains PDF preview without a host document-open capability", async () => {
    jest.mocked(isAppMode).mockReturnValue(true);
    jest.mocked(isDesktopAppMode).mockReturnValue(true);
    jest.mocked(readViewerResourceMetadata).mockResolvedValue({ documentKind: "document-pdf", mimeType: "application/pdf" } as never);
    jest.mocked(useAuthenticatedResourceUrl).mockReturnValue({ url: "blob:pdf-preview", loading: false, error: null });
    jest.mocked(getDesktopDocumentOpenOptions).mockResolvedValue({ available: false });
    await render(0, { type: "resource", name: "guide.pdf", url: "guide.pdf", downloadUrl: "guide.pdf", contentKind: "pdf",
      source: { kind: "reference", agentKey: "coder", chatId: "chat-1", resourceId: "pdf-reference", relativePath: "guide.pdf" } });
    expect(container.querySelector('iframe[title="guide.pdf"]')).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(openDesktopDocumentInLocalApp).not.toHaveBeenCalled();
  });

  describe.each([false, true])("Office preview in Desktop mode %s", (desktop) => {
    const reference = (extension: string): Extract<ViewerTarget, { type: "resource" }> => ({
      type: "resource", name: `申请表.${extension}`, url: `申请表.${extension}`, downloadUrl: `申请表.${extension}`, contentKind: "office",
      source: { kind: "reference", agentKey: "agent-1", chatId: "upload-chat", resourceId: "upload-1", relativePath: `申请表.${extension}` },
    });

    it.each(["docx", "pptx", "xlsx"])("keeps %s as metadata without a configured service", async (extension) => {
      jest.mocked(isAppMode).mockReturnValue(desktop);
      const file = reference(extension);
      await render(0, file);
      expect(container.textContent).toContain("未配置在线预览服务");
      expect(container.textContent).toContain(file.name);
      expect(container.textContent).toContain(extension.toUpperCase());
      expect(container.querySelector("details")).not.toBeNull();
      expect(container.textContent).toContain("36.8 kB");
      const buttons = Array.from(container.querySelectorAll("button"));
      expect(buttons.find((button) => button.textContent === "在线预览")?.disabled).toBe(true);
      expect(container.querySelector("iframe")).toBeNull();
      expect(readViewerResourceDocument).not.toHaveBeenCalled();
      expect(jest.mocked(useAuthenticatedResourceUrl).mock.calls.every(([url]) => url === "")).toBe(true);
      expect(downloadViewerTarget).not.toHaveBeenCalled();
      expect(readViewerResourceMetadata).toHaveBeenCalledWith(file.url, "upload-chat", expect.any(AbortSignal), false);
      await act(async () => buttons.find((button) => button.textContent?.replace(/\s/g, "") === "下载")!.click());
      expect(downloadViewerTarget).toHaveBeenCalledWith(file, { chatId: "upload-chat", teamChat: false });
    });

    it.each(["docx", "pptx", "xlsx"])("opens %s through the configured online service", async (extension) => {
      jest.mocked(isAppMode).mockReturnValue(desktop);
      const file = reference(extension);
      jest.mocked(getDocumentPreviewCapabilities).mockResolvedValueOnce({ data: {
        enabled: true, supportedExtensions: ["docx", "pptx", "xlsx"], maxFileBytes: 52428800, openMode: "iframe",
      } } as never);
      jest.mocked(prepareDocumentPreview).mockResolvedValueOnce({ data: {
        previewId: "p1", sourceRevision: "r1", openMode: "iframe", url: "https://docs.test/s/p1", expiresAt: Date.now() + 86400000,
      } } as never);
      await render(0, file);
      expect(container.querySelector("iframe")).toBeNull();
      await act(async () => Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "在线预览")!.click());
      expect(prepareDocumentPreview).toHaveBeenCalledWith(expect.objectContaining({
        source: { kind: "chat-resource", chatId: "upload-chat", relativePath: file.url },
      }), expect.any(AbortSignal));
      expect(container.querySelector("iframe")?.src).toBe("https://docs.test/s/p1");
      expect(readViewerResourceDocument).not.toHaveBeenCalled();
      expect(downloadViewerTarget).not.toHaveBeenCalled();
    });
  });

  it("offers an online preview and routes all three working buttons to the selected file", async () => {
    await render();
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual([
      "在线预览", "用默认应用打开", "下载", "在 Finder 中显示",
    ]);
    expect(buttons[0].disabled).toBe(true);
    expect(container.textContent).toContain("36.8 kB");
    expect(getDesktopDocumentOpenOptions).not.toHaveBeenCalled();
    expect(openDesktopDocumentInLocalApp).not.toHaveBeenCalled();
    expect(buttons[0].parentElement?.parentElement).toBe(buttons[1].parentElement);
    expect(buttons[2].parentElement).toBe(buttons[3].parentElement);
    await act(async () => buttons[2].click());
    expect(downloadViewerTarget).toHaveBeenCalledWith(target, { chatId: "chat-1", teamChat: false });
    for (const [index, action] of [[3, "reveal"], [1, "open-default"]] as const) {
      await act(async () => buttons[index].click());
      expect(openStandaloneViewerTarget).toHaveBeenLastCalledWith(action, target, { chatId: "chat-1", teamChat: false }, capabilities);
    }
  });

  it.each(["docx", "pptx", "xlsx"])("keeps the original %s panel when its host opens preview in a separate tab", async (extension) => {
    const onOpenOnlinePreview = jest.fn();
    const officeTarget: ViewerTarget = { ...target, name: `report.${extension}`, url: `artifacts/report.${extension}`, downloadUrl: `artifacts/report.${extension}` };
    const result = { previewId: "p1", sourceRevision: "r1", openMode: "iframe", url: "https://docs.test/s/p1", expiresAt: Date.now() + 86400000 };
    jest.mocked(getDocumentPreviewCapabilities).mockResolvedValueOnce({ data: {
      enabled: true, supportedExtensions: [extension], maxFileBytes: 52428800, openMode: "iframe",
    } } as never);
    jest.mocked(prepareDocumentPreview).mockResolvedValueOnce({ data: result } as never);
    await act(async () => root.render(React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false },
      React.createElement(ContentViewerPanel, { target: officeTarget, onOpenOnlinePreview }))));
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "在线预览");
    await act(async () => button!.click());
    expect(onOpenOnlinePreview).toHaveBeenCalledWith(expect.objectContaining({ target: officeTarget, chatId: "chat-1", result }));
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.textContent).toContain(`report.${extension}`);
    expect(container.textContent).toContain("在 Finder 中显示");
  });

  it("reloads metadata once per refresh and uses a fresh media cache lease", async () => {
    await render();
    jest.mocked(readViewerResourceMetadata).mockResolvedValue({ documentKind: "document-office", sizeBytes: 41000 } as never);
    await render(1);
    expect(readViewerResourceMetadata).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("41 kB");
    expect(jest.mocked(useAuthenticatedResourceUrl).mock.calls.at(-1)![2]!.refreshKey).toBeTruthy();
    await render(1);
    expect(readViewerResourceMetadata).toHaveBeenCalledTimes(2);
  });

  it("preserves unsaved text when refresh is cancelled and reloads only after confirmation", async () => {
    const file: ViewerTarget = { type: "file", agentKey: "coder", path: "draft.txt", name: "draft.txt", contentKind: "text" };
    jest.mocked(getAgentFile).mockResolvedValue({ data: {
      agentKey: "coder", requestedPath: "draft.txt", name: "draft.txt", contentKind: "text", documentKind: "document-text", content: "original", revision: "r1",
    } } as never);
    await render(0, file);
    const editor = () => jest.mocked(DocumentTextEditor).mock.calls.at(-1)![0];
    await act(async () => editor().onChange("unsaved edit"));
    const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
    await render(1, file);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(getAgentFile).toHaveBeenCalledTimes(1);
    expect(editor().value).toBe("unsaved edit");
    confirm.mockReturnValue(true);
    await render(2, file);
    expect(getAgentFile).toHaveBeenCalledTimes(2);
    expect(editor().value).toBe("original");
  });
});
