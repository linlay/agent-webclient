import {
  buildDesktopWorkPanelDescriptor,
  buildStandaloneOpenTargetUrl,
  normalizeProjectRelativePath,
  openDesktopWorkPanelTarget,
} from "@/features/surfaces/openTarget";
import { buildSurfaceRoute, parseSurfaceRoute } from "@/features/surfaces/surfaceRoutes";

describe("canonical independent Surface targets", () => {
  it("uses chat identity in chat-wide view paths and omits stale run identity", () => {
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "overview",
      chatId: "chat/a",
    }, "?lang=en&theme=light&runId=stale&desktopAuthContext=secret")).toBe(
      "/overview/chat%2Fa?lang=en&theme=light",
    );
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "debug",
      chatId: "chat-1",
    })).toBe("/debug/chat-1");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "terminal",
      agentKey: "agent-1",
    })).toBe("/terminal/agent-1?terminalKey=main");
  });

  it("builds every stable content identity", () => {
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "btw",
      agentKey: "agent-1",
      chatId: "chat-1",
      btwId: "btw-1",
    })).toBe("/btw/chat-1?btwId=btw-1");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "source",
      agentKey: "agent-1",
      chatId: "chat-1",
      publishId: "publish-1",
      sourceId: "source-1",
      chunkId: "chunk-1",
    })).toBe("/source-view/source-1?chatId=chat-1&chunkId=chunk-1");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "planning",
      agentKey: "agent-1",
      chatId: "chat-1",
      planningId: "run-1_planning_1",
    })).toBe("/planning-view/run-1_planning_1?chatId=chat-1");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "artifact",
      agentKey: "agent-1",
      chatId: "chat-1",
      artifactId: "artifact-1",
      preview: {
        name: "artifact.txt",
        url: "artifacts/run-1/artifact.txt",
        downloadUrl: "",
        kind: "text",
      },
    })).toBe("/resource-view/agent-1?chatId=chat-1&file=artifacts%2Frun-1%2Fartifact.txt");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "reference",
      agentKey: "agent-1",
      chatId: "chat-1",
      referenceId: "reference-1",
      preview: {
        name: "reference.pdf",
        url: "/resources/reference.pdf",
        downloadUrl: "",
        kind: "pdf",
      },
    })).toBe("/resource-view/agent-1?chatId=chat-1&file=%2Fresources%2Freference.pdf");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "file",
      agentKey: "agent-1",
      path: "src/app.ts",
      line: 12,
    })).toBe("/file-view/agent-1?path=src%2Fapp.ts&line=12");
  });

  it("uses the global history and Web wrapper routes", () => {
    expect(buildStandaloneOpenTargetUrl({ version: 1, kind: "history" }, "?lang=zh")).toBe(
      "/history?lang=zh",
    );
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "web",
      url: "https://example.com/path",
      title: "Example",
    })).toBe("/web-view?url=https%3A%2F%2Fexample.com%2Fpath&title=Example");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "web",
      url: "https://user:secret@example.com/path",
    })).toBe("");
  });

  it("requires canonical identities and never falls back to query agentKey", () => {
    expect(buildStandaloneOpenTargetUrl({ version: 1, kind: "debug", chatId: "chat-1" })).toBe(
      "/debug/chat-1",
    );
    expect(buildStandaloneOpenTargetUrl({ version: 1, kind: "debug", chatId: "" })).toBe("");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "planning",
      agentKey: "agent-1",
      chatId: "chat-1",
      planningId: "",
    })).toBe("");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "reference",
      agentKey: "agent-1",
      chatId: "chat-1",
      referenceId: "reference-1",
    })).toBe("");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "artifact",
      agentKey: "agent-1",
      chatId: "chat-1",
      artifactId: "artifact-1",
      preview: {
        name: "external.txt",
        url: "https://example.com/external.txt",
        downloadUrl: "https://example.com/external.txt",
        kind: "text",
      },
    })).toBe("");
  });

  it("maps typed Desktop WorkPanel descriptors", () => {
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "overview",
      chatId: "chat-1",
      agentKey: "agent-1",
    })).toMatchObject({
      kind: "webclient",
      module: "overview",
      route: "/overview/chat-1",
      context: { chatId: "chat-1", agentKey: "agent-1" },
    });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "source",
      agentKey: "agent-1",
      chatId: "chat-1",
      btwId: "btw-1",
      publishId: "publish-1",
      sourceId: "source-1",
    })).toMatchObject({
      module: "source",
      context: {
        agentKey: "agent-1",
        chatId: "chat-1",
        btwId: "btw-1",
        publishId: "publish-1",
        sourceId: "source-1",
      },
    });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "planning",
      agentKey: "agent-1",
      chatId: "chat-1",
      planningId: "planning-1",
    })).toMatchObject({ module: "planning", context: { planningId: "planning-1" } });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "artifact",
      agentKey: "agent-1",
      chatId: "chat-1",
      artifactId: "artifact-1",
      preview: {
        name: "artifact.txt",
        url: "artifacts/run-1/artifact.txt",
        downloadUrl: "",
        kind: "text",
      },
    })).toMatchObject({
      module: "artifact",
      route: "/resource-view/agent-1?chatId=chat-1&file=artifacts%2Frun-1%2Fartifact.txt",
      context: { agentKey: "agent-1", chatId: "chat-1", artifactId: "artifact-1" },
    });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "reference",
      agentKey: "agent-1",
      chatId: "chat-1",
      referenceId: "reference-1",
      preview: {
        name: "reference.pdf",
        url: "references/reference.pdf",
        downloadUrl: "",
        kind: "pdf",
      },
    })).toMatchObject({
      module: "reference",
      route: "/resource-view/agent-1?chatId=chat-1&file=references%2Freference.pdf",
      context: { agentKey: "agent-1", chatId: "chat-1", referenceId: "reference-1" },
    });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "web",
      url: "https://example.com/path",
    })).toMatchObject({ kind: "web", url: "https://example.com/path" });
  });

  it("keeps runId only for selected Project run and diff", () => {
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "project",
      agentKey: "coder",
      chatId: "chat-1",
    })).toBe("/project/coder?chatId=chat-1");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "project",
      agentKey: "coder",
      runId: "orphan-run",
    })).toBe("");
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "file-diff",
      agentKey: "coder",
      chatId: "chat-1",
      runId: "run-1",
      relativePath: "/workspace/src/app.ts",
    }, "", "/workspace")).toMatchObject({
      module: "file-diff",
      route: "/project/coder?chatId=chat-1&runId=run-1&path=src%2Fapp.ts&view=diff",
      context: { agentKey: "coder", chatId: "chat-1", runId: "run-1", path: "src/app.ts" },
    });
  });

  it.each(["overview", "debug"] as const)(
    "opens Desktop %s through WorkPanel",
    async (kind) => {
      const openDescriptor = jest.fn(async () => ({ ok: true }));
      expect(openDesktopWorkPanelTarget({
        intent: { version: 1, kind, chatId: "chat-1", agentKey: "agent-1" },
        workPanel: { openDescriptor },
      })).toBe(true);
      expect(openDescriptor).toHaveBeenCalledWith(expect.objectContaining({ module: kind }));
    },
  );

  it("normalizes project-relative file identities", () => {
    expect(normalizeProjectRelativePath("src/app.ts")).toBe("src/app.ts");
    expect(normalizeProjectRelativePath(
      "/Users/demo/project/src/app.ts",
      "/Users/demo/project",
    )).toBe("src/app.ts");
    expect(normalizeProjectRelativePath("/outside/app.ts", "/Users/demo/project")).toBe("");
    expect(normalizeProjectRelativePath("../secret")).toBe("");
  });

  it("round-trips every canonical route through the strict parser", () => {
    const intents = [
      { kind: "overview", chatId: "chat-1" },
      { kind: "debug", chatId: "chat-1" },
      { kind: "btw", chatId: "chat-1", btwId: "btw-1" },
      { kind: "source", chatId: "chat-1", sourceId: "src-1", chunkId: "chunk-1" },
      { kind: "planning", chatId: "chat-1", planningId: "plan-1" },
      { kind: "resource", agentKey: "agent-1", chatId: "chat-1", file: "/resources/art-1.txt" },
      { kind: "file", agentKey: "agent-1", path: "src/app.ts", line: 4 },
      { kind: "project", agentKey: "agent-1", chatId: "chat-1", runId: "run-1", path: "src/app.ts", view: "diff" },
      { kind: "terminal", agentKey: "agent-1", terminalKey: "main" },
      { kind: "agent", agentKey: "agent-1", chatId: "chat-1" },
      { kind: "history" },
      { kind: "web", url: "https://example.test/path", title: "Example" },
    ] as const;
    for (const intent of intents) {
      const route = buildSurfaceRoute(intent);
      const url = new URL(route, "https://local.invalid");
      expect(parseSurfaceRoute(url.pathname, url.search)).toEqual(intent);
    }
  });

  it("rejects removed no-agent and legacy query routes", () => {
    expect(parseSurfaceRoute("/overview", "?agentKey=agent-1&chatId=chat-1")).toBeNull();
    expect(parseSurfaceRoute("/debug", "?agentKey=agent-1&chatId=chat-1")).toBeNull();
    expect(parseSurfaceRoute("/overview", "?view=planning&nodeId=plan-1")).toBeNull();
    expect(parseSurfaceRoute("/agent", "?agentKey=agent-1&history=1")).toBeNull();
    expect(parseSurfaceRoute("/artifact-view/agent-1", "?chatId=chat-1&artifactId=art-1")).toBeNull();
    expect(parseSurfaceRoute("/reference-view/agent-1", "?chatId=chat-1&referenceId=ref-1")).toBeNull();
  });
});
