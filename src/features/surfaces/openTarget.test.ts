import {
  buildDesktopWorkPanelDescriptor,
  buildStandaloneOpenTargetUrl,
  normalizeProjectRelativePath,
} from "@/features/surfaces/openTarget";

describe("buildStandaloneOpenTargetUrl", () => {
  it("builds controlled read-only and terminal routes", () => {
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "overview",
      chatId: "chat/a",
      agentKey: "agent-1",
    }, "?lang=en&theme=light&runId=stale&desktopAuthContext=secret")).toBe(
      "/overview?lang=en&theme=light&chatId=chat%2Fa&agentKey=agent-1",
    );
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "terminal",
      agentKey: "agent-1",
    })).toBe("/terminal?agentKey=agent-1&terminalKey=main");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "planning",
      chatId: "chat-1",
      agentKey: "agent-1",
      nodeId: "planning-1",
      label: "Plan",
    })).toBe("/overview?chatId=chat-1&agentKey=agent-1&view=planning&nodeId=planning-1&label=Plan");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "artifact",
      chatId: "chat-1",
      agentKey: "agent-1",
      preview: {
        name: "report.pdf",
        url: "/api/resource?file=report.pdf",
        downloadUrl: "/api/resource?file=report.pdf&download=1",
        kind: "pdf",
      },
    })).toContain("/overview?chatId=chat-1&agentKey=agent-1&view=artifact&name=report.pdf");
  });

  it("requires chatId for read-only surfaces and agentKey for terminal", () => {
    expect(buildStandaloneOpenTargetUrl({ version: 1, kind: "debug", chatId: "", agentKey: "agent-1" })).toBe("");
    expect(buildStandaloneOpenTargetUrl({ version: 1, kind: "debug", chatId: "chat-1" })).toBe("/debug?chatId=chat-1");
    expect(buildStandaloneOpenTargetUrl({ version: 1, kind: "terminal", agentKey: "" })).toBe("");
  });

  it("maps stable Desktop WorkPanel descriptors", () => {
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "overview",
      chatId: "chat-1",
      runId: "run-1",
      agentKey: "agent-1",
    })).toMatchObject({
      kind: "webclient",
      module: "summary",
      route: "/overview?chatId=chat-1&runId=run-1&agentKey=agent-1",
      context: { chatId: "chat-1", runId: "run-1", agentKey: "agent-1" },
    });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "artifact",
      artifactId: "artifact-1",
      chatId: "chat-1",
      preview: { name: "report.pdf", url: "/api/file", kind: "pdf" },
    })).toMatchObject({
      kind: "webclient",
      module: "artifact",
      context: { artifactId: "artifact-1", chatId: "chat-1" },
    });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "artifact",
      chatId: "chat-1",
      preview: { name: "report.pdf", url: "/api/file", kind: "pdf" },
    })).toBeNull();
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "debug",
      chatId: "chat-1",
    })).toMatchObject({ kind: "webclient", module: "debug" });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "planning",
      chatId: "chat-1",
      nodeId: "node-1",
    })).toMatchObject({
      kind: "webclient",
      module: "planning",
      context: { chatId: "chat-1", nodeId: "node-1" },
    });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "project",
      projectId: "project-1",
    })).toMatchObject({
      kind: "webclient",
      module: "project",
      context: { projectId: "project-1" },
    });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "project",
    })).toBeNull();
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "file-diff",
      chatId: "chat-1",
      runId: "run-1",
      relativePath: "/workspace/src/app.ts",
    }, "", "/workspace")).toMatchObject({
      kind: "webclient",
      module: "file-diff",
      route: "/project?chatId=chat-1&runId=run-1&path=src%2Fapp.ts&view=diff",
      context: { chatId: "chat-1", runId: "run-1", relativePath: "src/app.ts" },
    });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "terminal",
      agentKey: "agent-1",
    })).toBeNull();
  });

  it("normalizes project-relative file diff identities", () => {
    expect(normalizeProjectRelativePath("src/app.ts")).toBe("src/app.ts");
    expect(normalizeProjectRelativePath(
      "/Users/demo/project/src/app.ts",
      "/Users/demo/project",
    )).toBe("src/app.ts");
    expect(normalizeProjectRelativePath("/outside/app.ts", "/Users/demo/project")).toBe("");
    expect(normalizeProjectRelativePath("../secret")).toBe("");
  });

  it("allows only absolute HTTP(S) web targets", () => {
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "web",
      url: "https://example.com/path",
    })).toBe("https://example.com/path");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "web",
      url: "javascript:alert(1)",
    })).toBe("");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "web",
      url: "/relative",
    })).toBe("");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "web",
      url: "https://user:secret@example.com/path",
    })).toBe("");
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "web",
      url: "https://example.com/path",
    })).toMatchObject({ kind: "web", url: "https://example.com/path" });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "web",
      url: "https://user:secret@example.com/path",
    })).toBeNull();
  });
});
