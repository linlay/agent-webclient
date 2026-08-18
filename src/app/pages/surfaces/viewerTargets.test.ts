import { buildFileViewerTargetFromRoute } from "@/app/pages/surfaces/FileViewerPage";
import { buildResourceViewerTargetFromRoute } from "@/app/pages/surfaces/ResourceViewerPage";

describe("independent Resource/File Viewer targets", () => {
  it("keeps Resource on the protected ChatScope request path", () => {
    expect(buildResourceViewerTargetFromRoute({
      agentKey: "agent_1",
      chatId: "chat_1",
      file: "artifacts/run_1/report.pdf",
    })).toMatchObject({
      name: "report.pdf",
      url: "artifacts/run_1/report.pdf",
      downloadUrl: "artifacts/run_1/report.pdf",
      type: "resource",
      contentKind: "pdf",
    });
  });

  it("rejects external and legacy resource endpoint URLs", () => {
    expect(buildResourceViewerTargetFromRoute({
      agentKey: "agent_1",
      chatId: "chat_1",
      file: "https://example.com/report.pdf",
    })).toBeNull();
    expect(buildResourceViewerTargetFromRoute({
      agentKey: "agent_1",
      chatId: "chat_1",
      file: "/api/resource?file=report.pdf",
    })).toBeNull();
  });

  it("keeps unknown Resource and Workspace files download-only", () => {
    expect(buildResourceViewerTargetFromRoute({
      agentKey: "agent_1",
      chatId: "chat_1",
      file: "artifacts/run_1/archive.zip",
    })).toMatchObject({ type: "resource", contentKind: "unsupported" });
    expect(buildFileViewerTargetFromRoute({
      agentKey: "agent_1",
      path: "archive.zip",
    })).toMatchObject({ type: "file", contentKind: "unsupported" });
  });

  it("keeps Workspace File identity and line targeting separate from Resource", () => {
    expect(buildFileViewerTargetFromRoute({
      agentKey: "coder agent",
      path: "src/App.tsx",
      line: 12.9,
    })).toMatchObject({
      name: "App.tsx",
      type: "file",
      agentKey: "coder agent",
      path: "src/App.tsx",
      contentKind: "text",
      line: 12,
    });
  });
});
