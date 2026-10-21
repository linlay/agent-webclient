/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MarkdownContent } from "./MarkdownContent";
import { getAgentFileContentBlob, getResourceBlob } from "@/shared/data";

jest.mock("./MarkdownCode", () => ({ MarkdownCode: ({ children }: { children: React.ReactNode }) => <code>{children}</code> }));
jest.mock("@/shared/data", () => ({
  ...jest.requireActual("@/shared/data"),
  getAgentFileContentBlob: jest.fn(),
  getResourceBlob: jest.fn(),
}));

describe("Markdown media through the real Markdown parser and resource hook", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    URL.createObjectURL = jest.fn(() => "blob:media-preview");
    URL.revokeObjectURL = jest.fn();
    jest.mocked(getAgentFileContentBlob).mockReset().mockResolvedValue(new Blob(["media"], { type: "application/octet-stream" }));
    jest.mocked(getResourceBlob).mockReset().mockResolvedValue(new Blob(["media"], { type: "application/octet-stream" }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    jest.useFakeTimers();
    await act(async () => root.unmount());
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    container.remove();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  });

  it.each([
    ["image", "png", "img"],
    ["audio", "mp3", "audio"],
    ["video", "mp4", "video"],
  ])("loads a Workspace %s with Chinese names and spaces using its owner", async (kind, extension, tag) => {
    const path = `docs/期权诞生 短片.${extension}`;
    await act(async () => root.render(<MarkdownContent
      content={`![${kind}](<@workspace/${path}>)`} chatId={`workspace-${kind}`} agentKey="history-owner"
    />));
    expect(getAgentFileContentBlob).toHaveBeenCalledWith({ agentKey: "history-owner", path });
    expect(getResourceBlob).not.toHaveBeenCalled();
    expect(container.querySelector(tag)?.getAttribute("src")).toBe("blob:media-preview");
    if (tag !== "img") expect(container.querySelector(tag)?.hasAttribute("controls")).toBe(true);
    if (tag === "video") expect(jest.mocked(URL.createObjectURL).mock.calls[0][0].type).toBe("video/mp4");
  });

  it("renders a local absolute MP4 as a video and reports playback errors", async () => {
    const path = "/Users/linlay/Downloads/期权诞生 短片.mp4";
    await act(async () => root.render(<MarkdownContent content={`![短片](<${path}>)`} chatId="absolute-video" />));
    expect(getResourceBlob).toHaveBeenCalledWith(expect.stringContaining("Downloads/"), { chatId: "absolute-video", teamChat: false });
    const video = container.querySelector("video");
    expect(video?.getAttribute("src")).toBe("blob:media-preview");
    expect(video?.hasAttribute("controls")).toBe(true);
    await act(async () => video?.dispatchEvent(new Event("error")));
    expect(container.querySelector('[role="status"]')?.textContent).toContain("短片");
    expect(container.querySelector("video")).toBeNull();
  });

  it("renders the originally reported video syntax with an unescaped space", async () => {
    await act(async () => root.render(<MarkdownContent
      content="![期权诞生 短片.mp4](/Users/linlay/Downloads/期权诞生 短片.mp4)" chatId="bare-space-video"
    />));
    expect(container.querySelector("video")?.getAttribute("src")).toBe("blob:media-preview");
    expect(getResourceBlob).toHaveBeenCalledTimes(1);
  });

  it("keeps media examples in code literal and leaves web links with spaces alone", async () => {
    await act(async () => root.render(<MarkdownContent content={[
      "`![短片](/tmp/期权 短片.mp4)`",
      "![外链](https://example.com/期权 短片.mp4)",
    ].join("\n\n")} chatId="code-example" />));
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("code")?.textContent).toContain("/tmp/期权 短片.mp4");
    expect(getResourceBlob).not.toHaveBeenCalled();
  });

  it("keeps cached Workspace media separate for different Agent owners", async () => {
    const content = "![image](@workspace/shared.png)";
    for (const agentKey of ["first-owner", "second-owner"]) {
      await act(async () => root.render(<MarkdownContent content={content} chatId="owner-isolation" agentKey={agentKey} />));
    }
    expect(getAgentFileContentBlob).toHaveBeenNthCalledWith(1, { agentKey: "first-owner", path: "shared.png" });
    expect(getAgentFileContentBlob).toHaveBeenNthCalledWith(2, { agentKey: "second-owner", path: "shared.png" });
  });

  it("shows a Workspace load failure without retrying a ChatScope resource", async () => {
    jest.mocked(getAgentFileContentBlob).mockRejectedValueOnce(new Error("forbidden"));
    await act(async () => root.render(<MarkdownContent content="![short](@workspace/denied.mp4)" chatId="denied" agentKey="owner" />));
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("short");
    expect(getResourceBlob).not.toHaveBeenCalled();
  });

  it.each(["@workspace/../secret.png", "@workspace/a//b.png", "@workspace/"])("never fetches an invalid Workspace path %s", async (path) => {
    await act(async () => root.render(<MarkdownContent content={`![图片](${path})`} chatId={path} agentKey="owner" />));
    expect(getAgentFileContentBlob).not.toHaveBeenCalled();
    expect(getResourceBlob).not.toHaveBeenCalled();
  });

  it("does not fetch Workspace media until its owner is available", async () => {
    const content = "![image](@workspace/ready.png)";
    await act(async () => root.render(<MarkdownContent content={content} chatId="owner-loading" />));
    expect(getAgentFileContentBlob).not.toHaveBeenCalled();
    await act(async () => root.render(<MarkdownContent content={content} chatId="owner-loading" agentKey="loaded-owner" />));
    expect(getAgentFileContentBlob).toHaveBeenCalledWith({ agentKey: "loaded-owner", path: "ready.png" });
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:media-preview");
  });
});
