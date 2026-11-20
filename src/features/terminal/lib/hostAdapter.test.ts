import {
  createDesktopTerminalHostAdapter,
  createTerminalHostAdapter,
  createWebTerminalHostAdapter,
} from "./hostAdapter";
import type {
  AgentWebclientTerminalHostBridge,
  AgentWebclientWorkPanelBridge,
} from "@/shared/contracts/generated/agentWebclientBridge";

describe("terminal hostAdapter", () => {
  it("provides web defaults, opens /file-viewer with line and col, and extracts dropped file paths", async () => {
    const openedUrls: string[] = [];
    const adapter = createWebTerminalHostAdapter({
      openUrl: (url) => {
        openedUrls.push(url);
      },
    });

    expect(adapter.kind).toBe("web");
    await expect(adapter.showContextMenu({ hasSelection: true, cwd: "/repo" })).resolves.toBeNull();
    await expect(adapter.revealCwd("/repo")).resolves.toEqual({ ok: false });
    expect(adapter.subscribeShortcut(() => undefined)).toBeInstanceOf(Function);

    adapter.openFileLink({
      agentKey: "coder",
      path: "src/app/index.tsx",
      line: 42,
      col: 10,
    });
    expect(openedUrls).toEqual([
      "/file-viewer/coder?path=src%2Fapp%2Findex.tsx&line=42&col=10",
    ]);

    const fakeFileWithPath = Object.assign(new File(["hi"], "demo.ts"), {
      path: "/Users/cc/repo/demo.ts",
    });
    const fakeFallbackFile = new File(["hi"], "plain.txt");
    expect(
      adapter.resolveDroppedFilePaths({
        files: [fakeFileWithPath, fakeFallbackFile],
        uriList: "file:///Users/cc/repo/from%20uri.txt\n# comment",
      }),
    ).toEqual(["/Users/cc/repo/demo.ts", "plain.txt"]);

    expect(
      adapter.resolveDroppedFilePaths({
        files: [],
        uriList: "# comment\nfile:///Users/cc/repo/only%20uri.txt\nfile://localhost/tmp/test.md",
      }),
    ).toEqual(["/Users/cc/repo/only uri.txt", "/tmp/test.md"]);
  });

  it("delegates Desktop context menu, revealCwd, clipboard, dropped file path, shortcut, and WorkPanel file link", async () => {
    let capturedShortcutListener: ((ev: { action: "clear" | "search" | "copy" | "paste" }) => void) | null = null;
    const hostBridge: AgentWebclientTerminalHostBridge = {
      version: 1,
      showContextMenu: jest.fn(async () => ({ action: "clear" })),
      revealCwd: jest.fn(async () => ({ ok: true })),
      readClipboardText: jest.fn(() => "pasted text"),
      writeClipboardText: jest.fn(),
      getFilePath: jest.fn((file) => `/native/path/${file.name}`),
      onShortcut: jest.fn((listener) => {
        capturedShortcutListener = listener;
        return () => {
          capturedShortcutListener = null;
        };
      }),
    };
    const openItem = jest.fn(async () => ({
      ok: true as const,
      workspaceId: "ws-1",
      item: {
        itemId: "item-1",
        stableKey: "file:coder:src/app.ts",
        descriptor: {
          kind: "webclient" as const,
          module: "file" as const,
          route: "/file-viewer/coder?path=src%2Fapp.ts&line=12&col=4",
          context: { agentKey: "coder", path: "src/app.ts" },
        },
        title: "app.ts",
        closable: true,
        pinned: false,
        createdAt: 1,
      },
    }));
    const workPanelBridge: AgentWebclientWorkPanelBridge = {
      getCapabilities: jest.fn(async () => ({ ok: true as const, capabilities: ["workpanel.open" as const] })),
      openItem,
      activateItem: jest.fn(async () => ({ ok: true as const, workspaceId: "ws-1" })),
      closeItem: jest.fn(async () => ({ ok: true as const, workspaceId: "ws-1" })),
    };

    const adapter = createDesktopTerminalHostAdapter({
      hostBridge,
      workPanelBridge,
    });

    expect(adapter.kind).toBe("desktop");
    await expect(adapter.showContextMenu({ hasSelection: true, cwd: "/repo" })).resolves.toBe("clear");
    expect(hostBridge.showContextMenu).toHaveBeenCalledWith({ hasSelection: true, cwd: "/repo" });

    await expect(adapter.revealCwd("/repo")).resolves.toEqual({ ok: true });
    expect(hostBridge.revealCwd).toHaveBeenCalledWith("/repo");

    await expect(adapter.readClipboardText()).resolves.toBe("pasted text");
    await adapter.writeClipboardText("copied");
    expect(hostBridge.writeClipboardText).toHaveBeenCalledWith("copied");

    const file = new File(["x"], "note.md");
    expect(adapter.resolveDroppedFilePaths({ files: [file], uriList: "" })).toEqual([
      "/native/path/note.md",
    ]);

    const seenShortcuts: string[] = [];
    const unsubscribe = adapter.subscribeShortcut((ev) => seenShortcuts.push(ev.action));
    capturedShortcutListener?.({ action: "copy" });
    expect(seenShortcuts).toEqual(["copy"]);
    unsubscribe();
    expect(capturedShortcutListener).toBeNull();

    const opened = await adapter.openFileLink({
      agentKey: "coder",
      path: "src/app.ts",
      line: 12,
      col: 4,
    });
    expect(opened).toBe(true);
    expect(openItem).toHaveBeenCalledWith({
      version: 6,
      descriptor: {
        kind: "webclient",
        module: "file",
        route: "/file-viewer/coder?path=src%2Fapp.ts&line=12&col=4",
        context: { agentKey: "coder", path: "src/app.ts" },
        title: "app.ts",
      },
    });
  });

  it("auto-selects web adapter when Desktop bridge global is absent", () => {
    const adapter = createTerminalHostAdapter({ win: {} as Window });
    expect(adapter.kind).toBe("web");
  });
});
