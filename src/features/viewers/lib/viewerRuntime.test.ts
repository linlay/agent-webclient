const mockDownloadResource = jest.fn();
const mockGetAgentFile = jest.fn();
const mockGetResourceText = jest.fn();
const mockGetResourceBlob = jest.fn();
const mockLocalAction = jest.fn();

jest.mock("@/shared/data", () => ({
  downloadResource: (...args: unknown[]) => mockDownloadResource(...args),
  getAgentFile: (...args: unknown[]) => mockGetAgentFile(...args),
  getResourceText: (...args: unknown[]) => mockGetResourceText(...args),
  getResourceBlob: (...args: unknown[]) => mockGetResourceBlob(...args),
}));
jest.mock("@/shared/data/standalone/standaloneFileActions", () => ({
  requestStandaloneFileAction: (...args: unknown[]) => mockLocalAction(...args),
}));

import {
  downloadViewerTarget,
  limitViewerText,
  readViewerResourceText,
  openStandaloneViewerTarget,
} from "@/features/viewers/lib/viewerRuntime";

describe("viewerRuntime", () => {
  beforeEach(() => {
    mockDownloadResource.mockReset();
    mockGetAgentFile.mockReset();
    mockGetResourceText.mockReset();
    mockGetResourceBlob.mockReset().mockResolvedValue(new Blob(["file bytes"]));
    mockLocalAction.mockReset().mockResolvedValue(undefined);
    mockDownloadResource.mockResolvedValue(undefined);
    mockGetResourceText.mockResolvedValue("preview");
    mockGetAgentFile.mockResolvedValue({
      data: { contentUrl: "artifacts/workspace/main.ts" },
    });
  });

  it.each([
    { type: "resource", name: "report.docx", url: "artifacts/report.docx", downloadUrl: "artifacts/report.docx", contentKind: "office" },
    { type: "resource", name: "source.docx", url: "references/source.docx", downloadUrl: "references/source.docx", contentKind: "office" },
    { type: "file", name: "workspace.docx", agentKey: "coder", path: "workspace.docx", contentKind: "office" },
  ] as const)("reads authorized bytes before opening $type $name locally", async (target) => {
    const capabilities = { token: "token", platform: "darwin" as const, maxBytes: 1024 };
    const options = { chatId: "chat_01", teamChat: true };
    await openStandaloneViewerTarget("open-default", target, options, capabilities);
    expect(mockGetResourceBlob).toHaveBeenCalledWith(
      target.type === "file" ? "artifacts/workspace/main.ts" : target.downloadUrl, options,
    );
    expect(mockLocalAction).toHaveBeenCalledWith("open-default", target.name, expect.any(Blob), capabilities);
  });

  it("does not send a local action when the resource read is denied", async () => {
    mockGetResourceBlob.mockRejectedValue(new Error("access denied"));
    await expect(openStandaloneViewerTarget("reveal", {
      type: "resource", name: "report.docx", url: "artifacts/report.docx", downloadUrl: "artifacts/report.docx", contentKind: "office",
    }, { chatId: "chat_01" }, { token: "token", platform: "darwin", maxBytes: 1024 })).rejects.toThrow("access denied");
    expect(mockLocalAction).not.toHaveBeenCalled();
  });

  it("downloads ChatScope and Workspace Viewer resources through one runtime", async () => {
    await downloadViewerTarget({
      type: "resource",
      name: "灯下.md",
      url: "artifacts/run_01/%E7%81%AF%E4%B8%8B.md",
      downloadUrl: "artifacts/run_01/%E7%81%AF%E4%B8%8B.md",
      contentKind: "text",
    }, {
      chatId: "chat_01",
      teamChat: true,
    });

    expect(mockDownloadResource).toHaveBeenLastCalledWith(
      "artifacts/run_01/%E7%81%AF%E4%B8%8B.md",
      {
        filename: "灯下.md",
        chatId: "chat_01",
        teamChat: true,
        signal: undefined,
      },
    );

    await downloadViewerTarget({
      type: "file",
      name: "main.ts",
      agentKey: "coder",
      path: "src/main.ts",
      contentKind: "text",
    }, {
      chatId: "chat_01",
    });

    expect(mockGetAgentFile).toHaveBeenCalledWith({
      agentKey: "coder",
      path: "src/main.ts",
    });
    expect(mockDownloadResource).toHaveBeenLastCalledWith(
      "artifacts/workspace/main.ts",
      {
        filename: "main.ts",
        chatId: "chat_01",
        teamChat: false,
        signal: undefined,
      },
    );
  });

  it("deduplicates concurrent Viewer download actions", async () => {
    let finishDownload: (() => void) | undefined;
    mockDownloadResource.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishDownload = resolve;
    }));
    const target = {
      type: "resource" as const,
      name: "report.pdf",
      url: "artifacts/run_01/report.pdf",
      downloadUrl: "artifacts/run_01/report.pdf",
      contentKind: "pdf" as const,
    };

    const first = downloadViewerTarget(target, { chatId: "chat_01" });
    const second = downloadViewerTarget(target, { chatId: "chat_01" });
    expect(first).toBe(second);
    expect(mockDownloadResource).toHaveBeenCalledTimes(1);

    finishDownload?.();
    await Promise.all([first, second]);
  });

  it("passes the current chatId to Resource Viewer text reads", async () => {
    const signal = new AbortController().signal;

    await readViewerResourceText(
      "artifacts/run_01/report.txt",
      "chat_01",
      signal,
    );

    expect(mockGetResourceText).toHaveBeenCalledWith(
      "artifacts/run_01/report.txt",
      { chatId: "chat_01", teamChat: false, signal },
    );
  });

  it("only truncates text previews that exceed the byte limit", () => {
    expect(limitViewerText("hello", 5)).toEqual({
      content: "hello",
      truncated: false,
    });
    expect(limitViewerText("hello!", 5)).toEqual({
      content: "hello",
      truncated: true,
    });
  });

  it("does not leave a broken multibyte character at the truncation boundary", () => {
    expect(limitViewerText("你好", 4)).toEqual({
      content: "你",
      truncated: true,
    });
  });
});
