const mockDownloadResource = jest.fn();
const mockGetAgentFile = jest.fn();
const mockGetResourceText = jest.fn();

jest.mock("@/shared/data", () => ({
  downloadResource: (...args: unknown[]) => mockDownloadResource(...args),
  getAgentFile: (...args: unknown[]) => mockGetAgentFile(...args),
  getResourceText: (...args: unknown[]) => mockGetResourceText(...args),
}));

import {
  downloadAttachmentPreview,
  downloadArtifactResource,
  limitTextPreview,
  readArtifactResourceText,
} from "@/features/artifacts/lib/artifactResourceRuntime";

describe("artifactResourceRuntime", () => {
  beforeEach(() => {
    mockDownloadResource.mockReset();
    mockGetAgentFile.mockReset();
    mockGetResourceText.mockReset();
    mockDownloadResource.mockResolvedValue(undefined);
    mockGetResourceText.mockResolvedValue("preview");
    mockGetAgentFile.mockResolvedValue({
      data: { contentUrl: "artifacts/workspace/main.ts" },
    });
  });

  it("downloads ChatScope and Workspace Viewer resources through one runtime", async () => {
    await downloadAttachmentPreview({
      name: "灯下.md",
      url: "artifacts/run_01/%E7%81%AF%E4%B8%8B.md",
      downloadUrl: "artifacts/run_01/%E7%81%AF%E4%B8%8B.md",
      kind: "text",
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

    await downloadAttachmentPreview({
      name: "main.ts",
      url: "workspace-file:coder:main.ts",
      downloadUrl: "",
      kind: "text",
      workspaceFile: { agentKey: "coder", path: "src/main.ts" },
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
    const preview = {
      name: "report.pdf",
      url: "artifacts/run_01/report.pdf",
      downloadUrl: "artifacts/run_01/report.pdf",
      kind: "pdf" as const,
    };

    const first = downloadAttachmentPreview(preview, { chatId: "chat_01" });
    const second = downloadAttachmentPreview(preview, { chatId: "chat_01" });
    expect(first).toBe(second);
    expect(mockDownloadResource).toHaveBeenCalledTimes(1);

    finishDownload?.();
    await Promise.all([first, second]);
  });

  it("passes the current chatId to Artifact download and text reads", async () => {
    const signal = new AbortController().signal;

    await downloadArtifactResource(
      "artifacts/run_01/image.png",
      "image.png",
      "chat_01",
      signal,
    );
    await readArtifactResourceText(
      "artifacts/run_01/report.txt",
      "chat_01",
      signal,
    );

    expect(mockDownloadResource).toHaveBeenCalledWith(
      "artifacts/run_01/image.png",
      { filename: "image.png", chatId: "chat_01", teamChat: false, signal },
    );
    expect(mockGetResourceText).toHaveBeenCalledWith(
      "artifacts/run_01/report.txt",
      { chatId: "chat_01", teamChat: false, signal },
    );
  });

  it("only truncates text previews that exceed the byte limit", () => {
    expect(limitTextPreview("hello", 5)).toEqual({
      content: "hello",
      truncated: false,
    });
    expect(limitTextPreview("hello!", 5)).toEqual({
      content: "hello",
      truncated: true,
    });
  });

  it("does not leave a broken multibyte character at the truncation boundary", () => {
    expect(limitTextPreview("你好", 4)).toEqual({
      content: "你",
      truncated: true,
    });
  });
});
