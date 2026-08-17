import { buildFileSurfacePreview } from "@/app/pages/surfaces/FileViewPage";
import { buildResourceSurfacePreview } from "@/app/pages/surfaces/ResourceViewPage";

describe("independent Resource/File preview targets", () => {
  it("keeps Resource on the protected ChatScope request path", () => {
    expect(buildResourceSurfacePreview({
      agentKey: "agent_1",
      chatId: "chat_1",
      file: "artifacts/run_1/report.pdf",
    })).toMatchObject({
      name: "report.pdf",
      url: "artifacts/run_1/report.pdf",
      downloadUrl: "artifacts/run_1/report.pdf",
      kind: "pdf",
    });
  });

  it("rejects external and legacy resource endpoint URLs", () => {
    expect(buildResourceSurfacePreview({
      agentKey: "agent_1",
      chatId: "chat_1",
      file: "https://example.com/report.pdf",
    })).toBeNull();
    expect(buildResourceSurfacePreview({
      agentKey: "agent_1",
      chatId: "chat_1",
      file: "/api/resource?file=report.pdf",
    })).toBeNull();
  });

  it("keeps unknown Resource and Workspace files download-only", () => {
    expect(buildResourceSurfacePreview({
      agentKey: "agent_1",
      chatId: "chat_1",
      file: "artifacts/run_1/archive.zip",
    })).toMatchObject({ kind: "unsupported" });
    expect(buildFileSurfacePreview({
      agentKey: "agent_1",
      path: "archive.zip",
    })).toMatchObject({ kind: "unsupported" });
  });

  it("keeps Workspace File identity and line targeting separate from Resource", () => {
    expect(buildFileSurfacePreview({
      agentKey: "coder agent",
      path: "src/App.tsx",
      line: 12.9,
    })).toMatchObject({
      name: "App.tsx",
      sourcePath: "src/App.tsx",
      line: 12,
      workspaceFile: { agentKey: "coder agent", path: "src/App.tsx" },
      url: "workspace-file:coder%20agent:src%2FApp.tsx",
    });
  });
});
