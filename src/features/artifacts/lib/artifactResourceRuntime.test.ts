const mockDownloadResource = jest.fn();
const mockGetResourceText = jest.fn();

jest.mock("@/shared/data", () => ({
  downloadResource: (...args: unknown[]) => mockDownloadResource(...args),
  getResourceText: (...args: unknown[]) => mockGetResourceText(...args),
}));

import {
  downloadArtifactResource,
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
});
