/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ContentViewerPanel } from "./ContentViewerPanel";
import { DocumentTextEditor } from "./DocumentTextEditor";
import { getAgentFile } from "@/shared/data";
import { downloadViewerTarget, openStandaloneViewerTarget, readViewerResourceMetadata } from "@/features/viewers/lib/viewerRuntime";
import type { ViewerTarget } from "@/features/viewers/lib/viewerTarget";
import { canUseStandaloneFileActions, getStandaloneFileCapabilities } from "@/shared/data/standalone/standaloneFileActions";
import { useAuthenticatedResourceUrl } from "@/shared/ui/useAuthenticatedResourceUrl";
import { I18nProvider } from "@/shared/i18n";

jest.mock("@/app/state/AppContext", () => ({ useAppState: () => ({ chatId: "chat-1", chats: [] }) }));
jest.mock("@/shared/data", () => ({ getAgentFile: jest.fn() }));
jest.mock("@/shared/ui/useAuthenticatedResourceUrl", () => ({ useAuthenticatedResourceUrl: jest.fn(() => ({ url: "", loading: false, error: null })) }));
jest.mock("./DocumentTextEditor", () => ({ DocumentTextEditor: jest.fn(() => null) }));
jest.mock("./BrowserImageEditor", () => ({ BrowserImageEditor: () => null }));
jest.mock("@/features/viewers/lib/viewerRuntime", () => ({
  downloadViewerTarget: jest.fn(), openStandaloneViewerTarget: jest.fn(), readViewerResourceMetadata: jest.fn(),
}));
jest.mock("@/shared/data/standalone/standaloneFileActions", () => ({
  canUseStandaloneFileActions: jest.fn(), getStandaloneFileCapabilities: jest.fn(),
}));

const target: ViewerTarget = {
  type: "resource", name: "项目立项建议书.docx", url: "artifacts/report.docx",
  downloadUrl: "artifacts/report.docx", contentKind: "office",
};
const capabilities = { token: "token", platform: "darwin" as const, maxBytes: 1024 };

describe("standalone document panel", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    jest.clearAllMocks();
    jest.mocked(canUseStandaloneFileActions).mockReturnValue(true);
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

  it("offers a planned preview and routes all three working buttons to the selected file", async () => {
    await render();
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual([
      "在线预览（规划中）", "下载", "在 Finder 中显示", "用默认应用打开",
    ]);
    expect(buttons[0].disabled).toBe(true);
    expect(container.textContent).toContain("36,800");
    await act(async () => buttons[1].click());
    expect(downloadViewerTarget).toHaveBeenCalledWith(target, { chatId: "chat-1", teamChat: false });
    for (const [index, action] of [[2, "reveal"], [3, "open-default"]] as const) {
      await act(async () => buttons[index].click());
      expect(openStandaloneViewerTarget).toHaveBeenLastCalledWith(action, target, { chatId: "chat-1", teamChat: false }, capabilities);
    }
  });

  it("reloads metadata once per refresh and uses a fresh media cache lease", async () => {
    await render();
    jest.mocked(readViewerResourceMetadata).mockResolvedValue({ documentKind: "document-office", sizeBytes: 41000 } as never);
    await render(1);
    expect(readViewerResourceMetadata).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("41,000");
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
