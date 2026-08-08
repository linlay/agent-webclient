const mockDownloadResource = jest.fn();
const mockGetResourceText = jest.fn();

jest.mock("@/shared/data", () => ({
  downloadResource: (...args: unknown[]) => mockDownloadResource(...args),
  getResourceText: (...args: unknown[]) => mockGetResourceText(...args),
}));

import {
  downloadArtifactResource,
  limitTextPreview,
  readArtifactResourceText,
} from "@/features/artifacts/lib/artifactResourceRuntime";

describe("artifactResourceRuntime", () => {
  beforeEach(() => {
    mockDownloadResource.mockReset();
    mockGetResourceText.mockReset();
    mockDownloadResource.mockResolvedValue(undefined);
    mockGetResourceText.mockResolvedValue("preview");
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
