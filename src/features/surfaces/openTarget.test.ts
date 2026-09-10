import { matchPath } from "react-router-dom";
import {
  buildDesktopNativeResourceRequest,
  buildDesktopWorkPanelDescriptor,
  buildStandaloneOpenTargetUrl,
  normalizeProjectRelativePath,
  normalizeWorkspaceFileRequestPath,
  openDesktopWorkPanelTarget,
  resolveWorkPanelFileTitle,
} from "@/features/surfaces/openTarget";
import { buildSurfaceRoute, SURFACE_ROUTE_PATHS } from "@/features/surfaces/surfaceRoutes";

describe("canonical independent Surface targets", () => {
  it.each(["申请表.docx", "references/申请表.docx"])("preserves the uploaded Reference identity for %s", (path) => {
    const result = buildDesktopNativeResourceRequest({
      version: 1, kind: "reference", agentKey: "agent-1", chatId: "chat-1", referenceId: "upload-1",
      resourceTarget: { type: "resource", name: "申请表.docx", url: path.split("/").map(encodeURIComponent).join("/"), downloadUrl: "", contentKind: "office" },
    });
    expect(result).toMatchObject({ profile: "reference", resourceId: "upload-1", relativePath: path });
  });
  it.each(["../notes.txt", "%252e%252e", "artifacts/run/notes.txt", "uploads/notes.txt", "C:/notes.txt"])("does not relax the Reference boundary for %s", (url) => {
    expect(buildDesktopNativeResourceRequest({
      version: 1, kind: "reference", agentKey: "agent-1", chatId: "chat-1", referenceId: "upload-1",
      resourceTarget: { type: "resource", name: "notes.txt", url, downloadUrl: "", contentKind: "text" },
    })).toBeNull();
  });
  it("uses explicit title, raw cross-platform basename, and bounded file fallback", () => {
    expect(resolveWorkPanelFileTitle("/tmp/report.md", "  Report  ")).toBe("Report");
    expect(resolveWorkPanelFileTitle("C:\\Users\\demo\\notes.txt")).toBe("notes.txt");
    expect(resolveWorkPanelFileTitle("\\\\server\\share\\中文 文件.md")).toBe("中文 文件.md");
    expect(resolveWorkPanelFileTitle("/tmp/a%20b.txt")).toBe("a%20b.txt");
    expect(resolveWorkPanelFileTitle("///")).toBe("file");
    expect(resolveWorkPanelFileTitle("/tmp/ok.txt", "bad\u0000title")).toBe("ok.txt");
    expect(resolveWorkPanelFileTitle(`/tmp/${"x".repeat(220)}.txt`)).toHaveLength(160);
  });

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
      kind: "skill",
      key: "pdf",
    })).toBe("/skill-viewer/pdf");
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
    })).toBe("/source-viewer/source-1?chatId=chat-1&chunkId=chunk-1");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "planning",
      agentKey: "agent-1",
      chatId: "chat-1",
      planningId: "run-1_planning_1",
    })).toBe("/planning-viewer/run-1_planning_1?chatId=chat-1");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "artifact",
      agentKey: "agent-1",
      chatId: "chat-1",
      artifactId: "artifact-1",
      resourceTarget: {
        type: "resource",
        name: "artifact.txt",
        url: "artifacts/run-1/artifact.txt",
        downloadUrl: "",
        contentKind: "text",
      },
    })).toBe("/resource-viewer/agent-1?chatId=chat-1&file=artifacts%2Frun-1%2Fartifact.txt&sourceKind=artifact&resourceId=artifact-1&relativePath=artifacts%2Frun-1%2Fartifact.txt");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "reference",
      agentKey: "agent-1",
      chatId: "chat-1",
      referenceId: "reference-1",
      resourceTarget: {
        type: "resource",
        name: "reference.pdf",
        url: "/resources/reference.pdf",
        downloadUrl: "",
        contentKind: "pdf",
      },
    })).toBe("/resource-viewer/agent-1?chatId=chat-1&file=%2Fresources%2Freference.pdf");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "resource",
      agentKey: "agent-1",
      chatId: "chat-1",
      file: "artifacts/msx9nzkm/%E7%81%AF%E4%B8%8B.md",
      resourceTarget: {
        type: "resource",
        name: "灯下.md",
        url: "artifacts/msx9nzkm/%E7%81%AF%E4%B8%8B.md",
        downloadUrl: "artifacts/msx9nzkm/%E7%81%AF%E4%B8%8B.md",
        contentKind: "text",
      },
    })).toBe(
      "/resource-viewer/agent-1?chatId=chat-1&file=artifacts%2Fmsx9nzkm%2F%25E7%2581%25AF%25E4%25B8%258B.md",
    );
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "file",
      agentKey: "agent-1",
      path: "src/app.ts",
      line: 12,
    })).toBe("/file-viewer/agent-1?path=src%2Fapp.ts&line=12");
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
    })).toBe("/web-viewer?url=https%3A%2F%2Fexample.com%2Fpath&title=Example");
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
      resourceTarget: {
        type: "resource",
        name: "external.txt",
        url: "https://example.com/external.txt",
        downloadUrl: "https://example.com/external.txt",
        contentKind: "text",
      },
    })).toBe("");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "artifact",
      agentKey: "agent-1",
      chatId: "chat-1",
      artifactId: "artifact-1",
      resourceTarget: {
        type: "resource",
        name: "inline.txt",
        url: "data:text/plain,demo",
        downloadUrl: "",
        contentKind: "text",
      },
    })).toBe("");
    expect(buildStandaloneOpenTargetUrl({
      version: 1,
      kind: "reference",
      agentKey: "agent-1",
      chatId: "chat-1",
      referenceId: "reference-1",
      resourceTarget: {
        type: "resource",
        name: "legacy.txt",
        url: "/api/resource?file=legacy.txt",
        downloadUrl: "",
        contentKind: "text",
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
      chatId: "chat-1",
      planningId: "planning-1",
      label: "Implementation plan",
    })).toEqual({
      kind: "webclient",
      module: "planning",
      route: "/planning-viewer/planning-1?chatId=chat-1",
      context: { chatId: "chat-1", planningId: "planning-1" },
      title: "Implementation plan",
    });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "skill",
      key: "pdf",
      label: "PDF",
    })).toEqual({
      kind: "webclient",
      module: "skill",
      route: "/skill-viewer/pdf",
      context: { key: "pdf" },
      title: "PDF",
    });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "skill",
      key: " ",
    })).toBeNull();
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "overview",
      chatId: "chat-1",
    })).toBeNull();
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "artifact",
      agentKey: "agent-1",
      chatId: "chat-1",
      artifactId: "artifact-1",
      resourceTarget: {
        type: "resource",
        name: "artifact.txt",
        url: "artifacts/run-1/artifact.txt",
        downloadUrl: "",
        contentKind: "text",
      },
    })).toMatchObject({
      module: "artifact",
      route: "/resource-viewer/agent-1?chatId=chat-1&file=artifacts%2Frun-1%2Fartifact.txt&sourceKind=artifact&resourceId=artifact-1&relativePath=artifacts%2Frun-1%2Fartifact.txt",
      context: { agentKey: "agent-1", chatId: "chat-1", artifactId: "artifact-1" },
    });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "reference",
      agentKey: "agent-1",
      chatId: "chat-1",
      referenceId: "reference-1",
      resourceTarget: {
        type: "resource",
        name: "reference.pdf",
        url: "references/reference.pdf",
        downloadUrl: "",
        contentKind: "pdf",
      },
    })).toMatchObject({
      module: "reference",
      route: "/resource-viewer/agent-1?chatId=chat-1&file=references%2Freference.pdf&sourceKind=reference&resourceId=reference-1&relativePath=references%2Freference.pdf",
      context: { agentKey: "agent-1", chatId: "chat-1", referenceId: "reference-1" },
    });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "file",
      agentKey: "agent-1",
      path: "/Users/demo/project/src/app.ts",
      line: 12,
    })).toMatchObject({
      module: "file",
      route: "/file-viewer/agent-1?path=%2FUsers%2Fdemo%2Fproject%2Fsrc%2Fapp.ts&line=12",
      context: { agentKey: "agent-1", path: "/Users/demo/project/src/app.ts" },
      title: "app.ts",
    });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "file",
      agentKey: "agent-1",
      path: "C:\\Users\\demo\\project\\README.md",
      title: "Explicit title",
    })).toMatchObject({
      context: { agentKey: "agent-1", path: "C:/Users/demo/project/README.md" },
      title: "Explicit title",
    });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "file",
      agentKey: "agent-1",
      path: "\\\\server\\share\\docs\\说明.txt",
    })).toMatchObject({ title: "说明.txt" });
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "resource",
      agentKey: "agent-1",
      chatId: "chat-1",
      file: "artifacts/run-1/archive.zip",
      resourceTarget: {
        type: "resource",
        name: "archive.zip",
        url: "artifacts/run-1/archive.zip",
        downloadUrl: "artifacts/run-1/archive.zip",
        contentKind: "unsupported",
      },
    })).toMatchObject({
      module: "artifact",
      route: "/resource-viewer/agent-1?chatId=chat-1&file=artifacts%2Frun-1%2Farchive.zip",
      context: {
        agentKey: "agent-1",
        chatId: "chat-1",
        artifactId: expect.stringMatching(/^resource:/),
      },
      title: "archive.zip",
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
    expect(buildDesktopWorkPanelDescriptor({
      version: 1,
      kind: "file-diff",
      agentKey: "coder",
      chatId: "chat-1",
      runId: "run-1",
      relativePath: "/workspace/src/app.ts",
    })).toMatchObject({
      module: "file-diff",
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

  it("opens Desktop Planning through WorkPanel without an agent identity", () => {
    const openDescriptor = jest.fn(async () => ({ ok: true }));
    expect(openDesktopWorkPanelTarget({
      intent: {
        version: 1,
        kind: "planning",
        chatId: "team-chat-1",
        planningId: "planning-1",
        label: "Team plan",
      },
      workPanel: { openDescriptor },
    })).toBe(true);
    expect(openDescriptor).toHaveBeenCalledWith({
      kind: "webclient",
      module: "planning",
      route: "/planning-viewer/planning-1?chatId=team-chat-1",
      context: { chatId: "team-chat-1", planningId: "planning-1" },
      title: "Team plan",
    });
  });

  it("opens Desktop File through WorkPanel without worker workspace metadata", () => {
    const openDescriptor = jest.fn(async () => ({ ok: true }));
    const onError = jest.fn();
    expect(openDesktopWorkPanelTarget({
      intent: {
        version: 1,
        kind: "file",
        agentKey: "agent-1",
        path: "/Users/demo/project/README.md",
      },
      workPanel: { openDescriptor },
      onError,
    })).toBe(true);
    expect(openDescriptor).toHaveBeenCalledWith({
      kind: "webclient",
      module: "file",
      route: "/file-viewer/agent-1?path=%2FUsers%2Fdemo%2Fproject%2FREADME.md",
      context: { agentKey: "agent-1", path: "/Users/demo/project/README.md" },
      title: "README.md",
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["artifact", "artifactId"],
    ["reference", "referenceId"],
  ] as const)("opens Desktop %s through Resource WorkPanel before loading", (kind, identityKey) => {
    const openDescriptor = jest.fn(async () => ({ ok: true }));
    const resourceTarget = {
      type: "resource" as const,
      name: `${kind}.txt`,
      url: `${kind}s/run-1/${kind}.txt`,
      downloadUrl: "",
      contentKind: "text" as const,
    };
    const intent = {
      version: 1 as const,
      kind,
      agentKey: "agent-1",
      chatId: "chat-1",
      [identityKey]: `${kind}-1`,
      resourceTarget,
    };
    expect(openDesktopWorkPanelTarget({ intent, workPanel: { openDescriptor } })).toBe(true);
    expect(openDescriptor).toHaveBeenCalledWith(expect.objectContaining({
      module: kind,
      route: expect.stringMatching(/^\/resource-viewer\/agent-1\?/),
    }));
  });

  it("builds a minimal native image request from a canonical encoded Artifact path", () => {
    expect(buildDesktopNativeResourceRequest({
      version: 1,
      kind: "artifact",
      agentKey: "agent-1",
      chatId: "chat-1",
      artifactId: "artifact-1",
      resourceTarget: {
        type: "resource",
        name: "夏日 海报.png",
        url: "artifacts/run-1/%E5%A4%8F%E6%97%A5%20%E6%B5%B7%E6%8A%A5.png",
        downloadUrl: "",
        contentKind: "image",
      },
    })).toEqual({
      profile: "artifact",
      agentKey: "agent-1",
      chatId: "chat-1",
      resourceId: "artifact-1",
      relativePath: "artifacts/run-1/夏日 海报.png",
      title: "夏日 海报.png",
    });
    expect(buildDesktopNativeResourceRequest({
      version: 1,
      kind: "artifact",
      agentKey: "agent-1",
      chatId: "chat-1",
      artifactId: "artifact-1",
      resourceTarget: {
        type: "resource",
        name: "unsafe.png",
        url: "artifacts/%252e%252e/unsafe.png",
        downloadUrl: "",
        contentKind: "image",
      },
    })).toBeNull();
  });

  it("uses native images and falls back only for unsupported native types", async () => {
    const imageIntent = {
      version: 1 as const,
      kind: "artifact" as const,
      agentKey: "agent-1",
      chatId: "chat-1",
      artifactId: "artifact-1",
      resourceTarget: {
        type: "resource" as const,
        name: "image.png",
        url: "artifacts/run-1/image.png",
        downloadUrl: "",
        contentKind: "image" as const,
      },
    };
    const openDescriptor = jest.fn(async () => ({ ok: true }));
    const openNativeResource = jest.fn(async () => ({
      ok: true as const,
      workspaceId: "workpanel:chat-1",
      itemId: "native-image-1",
      renderer: "native-image" as const,
    }));
    expect(openDesktopWorkPanelTarget({
      intent: imageIntent,
      workPanel: {
        openDescriptor,
        supportsNativeResource: () => true,
        openNativeResource,
      },
    })).toBe(true);
    await Promise.resolve();
    expect(openNativeResource).toHaveBeenCalledWith(expect.objectContaining({
      resourceId: "artifact-1",
      relativePath: "artifacts/run-1/image.png",
    }));
    expect(openDescriptor).not.toHaveBeenCalled();

    openNativeResource.mockResolvedValueOnce({
      ok: false,
      error: { code: "unsupported_native_type", message: "not native" },
    });
    openDesktopWorkPanelTarget({
      intent: imageIntent,
      workPanel: {
        openDescriptor,
        supportsNativeResource: () => true,
        openNativeResource,
      },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(openDescriptor).toHaveBeenCalledTimes(1);
  });

  it("preserves the Desktop WorkPanel transport receiver when opening a native image", async () => {
    const nativeOpen = jest.fn();
    class ReceiverAwareWorkPanel {
      readonly ready = true;

      supportsNativeResource(): boolean {
        return this.ready;
      }

      async openNativeResource(input: { resourceId: string }) {
        if (!this.ready) throw new Error("missing WorkPanel receiver");
        nativeOpen(input);
        return {
          ok: true as const,
          workspaceId: "workpanel:chat-1",
          itemId: "native-image-1",
          renderer: "native-image" as const,
        };
      }

      async openDescriptor() {
        return { ok: true as const };
      }
    }

    expect(openDesktopWorkPanelTarget({
      intent: {
        version: 1,
        kind: "artifact",
        agentKey: "agent-1",
        chatId: "chat-1",
        artifactId: "artifact-1",
        resourceTarget: {
          type: "resource",
          name: "image.png",
          url: "artifacts/run-1/image.png",
          downloadUrl: "",
          contentKind: "image",
        },
      },
      workPanel: new ReceiverAwareWorkPanel(),
    })).toBe(true);
    await Promise.resolve();
    expect(nativeOpen).toHaveBeenCalledWith(expect.objectContaining({
      resourceId: "artifact-1",
      relativePath: "artifacts/run-1/image.png",
    }));
  });

  it("does not fall back after a native image authorization failure", async () => {
    const openDescriptor = jest.fn(async () => ({ ok: true }));
    const onError = jest.fn();
    openDesktopWorkPanelTarget({
      intent: {
        version: 1,
        kind: "reference",
        agentKey: "agent-1",
        chatId: "chat-1",
        referenceId: "reference-1",
        resourceTarget: {
          type: "resource",
          name: "image.webp",
          url: "references/image.webp",
          downloadUrl: "",
          contentKind: "image",
        },
      },
      workPanel: {
        openDescriptor,
        supportsNativeResource: () => true,
        openNativeResource: jest.fn(async () => ({
          ok: false,
          error: { code: "capability_denied", message: "wrong owner" },
        })),
      },
      onError,
    });
    await Promise.resolve();
    expect(openDescriptor).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("[workpanel] wrong owner");
  });

  it("normalizes project-relative file identities", () => {
    expect(normalizeProjectRelativePath("src/app.ts")).toBe("src/app.ts");
    expect(normalizeProjectRelativePath(
      "/Users/demo/project/src/app.ts",
      "/Users/demo/project",
    )).toBe("src/app.ts");
    expect(normalizeProjectRelativePath("/outside/app.ts", "/Users/demo/project")).toBe("");
    expect(normalizeProjectRelativePath("../secret")).toBe("");
  });

  it("normalizes only structural details of Platform File request paths", () => {
    expect(normalizeWorkspaceFileRequestPath("src/app.ts")).toBe("src/app.ts");
    expect(normalizeWorkspaceFileRequestPath("../outside.txt")).toBe("../outside.txt");
    expect(normalizeWorkspaceFileRequestPath("/Users/demo/project/src/app.ts")).toBe(
      "/Users/demo/project/src/app.ts",
    );
    expect(normalizeWorkspaceFileRequestPath("C:\\Users\\demo\\app.ts")).toBe(
      "C:/Users/demo/app.ts",
    );
    expect(normalizeWorkspaceFileRequestPath("\\\\server\\share\\app.ts")).toBe(
      "//server/share/app.ts",
    );
    expect(normalizeWorkspaceFileRequestPath(" file with spaces ")).toBe(" file with spaces ");
    expect(normalizeWorkspaceFileRequestPath("bad\u0000path")).toBe("");
    expect(normalizeWorkspaceFileRequestPath("\n/etc/hosts")).toBe("");
    expect(normalizeWorkspaceFileRequestPath("a".repeat(2_049))).toBe("");
  });

  it("builds canonical routes matched by the production React Router paths", () => {
    const intents = [
      { kind: "overview", chatId: "chat-1" },
      { kind: "debug", chatId: "chat-1" },
      { kind: "btw", chatId: "chat-1", btwId: "btw-1" },
      { kind: "source", chatId: "chat-1", sourceId: "src-1", chunkId: "chunk-1" },
      { kind: "planning", chatId: "chat-1", planningId: "plan-1" },
      { kind: "resource", agentKey: "agent-1", chatId: "chat-1", file: "/resources/art-1.txt" },
      { kind: "file", agentKey: "agent-1", path: "/Users/demo/project/src/app.ts", line: 4 },
      { kind: "project", agentKey: "agent-1", chatId: "chat-1", runId: "run-1", path: "src/app.ts", view: "diff" },
      { kind: "terminal", agentKey: "agent-1", terminalKey: "main" },
      { kind: "agent", agentKey: "agent-1", chatId: "chat-1" },
      { kind: "history" },
      { kind: "web", url: "https://example.test/path", title: "Example" },
    ] as const;
    for (const intent of intents) {
      const route = buildSurfaceRoute(intent);
      const url = new URL(route, "https://local.invalid");
      const match = matchPath(SURFACE_ROUTE_PATHS[intent.kind], url.pathname);
      expect(match).not.toBeNull();
      for (const [key, value] of Object.entries(intent)) {
        if (key === "kind") continue;
        expect(match?.params[key] ?? url.searchParams.get(key)).toBe(String(value));
      }
    }
  });

  it.each([
    "/overview?agentKey=agent-1&chatId=chat-1",
    "/debug?agentKey=agent-1&chatId=chat-1",
    "/overview?view=planning&nodeId=plan-1",
    "/agent?agentKey=agent-1&history=1",
    "/artifact-view/agent-1?chatId=chat-1&artifactId=art-1",
    "/reference-view/agent-1?chatId=chat-1&referenceId=ref-1",
  ])("does not match removed route %s", (route) => {
    const url = new URL(route, "https://local.invalid");
    expect(Object.values(SURFACE_ROUTE_PATHS).some(
      (path) => matchPath(path, url.pathname),
    )).toBe(false);
  });
});
