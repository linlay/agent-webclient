import {
  initializeDesktopContextMenuBridge,
  registerDesktopCurrentResourceDownload,
  registerDesktopContextMenuTarget,
  resolveDesktopContextMenuTargetAt,
  SERVICE_WEBVIEW_BRIDGE_ACTION_CHANNEL,
  WEBVIEW_CONTEXT_MENU_SEMANTIC_RESPONSE_CHANNEL,
} from "./desktopContextMenu";
import {
  AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION,
  AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION,
} from "@/features/transport/contracts/generated/agentWebclientBridge";

type FakeElement = {
  parentElement: FakeElement | null;
};

describe("Desktop context menu semantic bridge", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalDocument = (globalThis as { document?: unknown }).document;

  afterEach(() => {
    if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window");
    else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    if (originalDocument === undefined) Reflect.deleteProperty(globalThis, "document");
    else Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  });

  it("resolves the nearest registered ancestor and unregisters without DOM attributes", () => {
    const parent: FakeElement = { parentElement: null };
    const child: FakeElement = { parentElement: parent };
    const leaf: FakeElement = { parentElement: child };
    const parentDescriptor = {
      targetId: "message:1",
      kind: "message" as const,
      handlers: { "copy-content": jest.fn() },
    };
    const childDescriptor = {
      targetId: "code:1",
      kind: "code" as const,
      handlers: { "copy-code": jest.fn() },
    };
    registerDesktopContextMenuTarget(parent as unknown as Element, parentDescriptor);
    const unregisterChild = registerDesktopContextMenuTarget(
      child as unknown as Element,
      childDescriptor,
    );
    const targetDocument = {
      elementFromPoint: () => leaf as unknown as Element,
    };

    expect(resolveDesktopContextMenuTargetAt(4, 5, targetDocument)).toBe(childDescriptor);
    unregisterChild();
    expect(resolveDesktopContextMenuTargetAt(4, 5, targetDocument)).toBe(parentDescriptor);
    expect(Object.keys(child)).toEqual(["parentElement"]);
  });

  it("returns a versioned, bounded semantic response without content, paths or auth URLs", () => {
    const target: FakeElement = { parentElement: null };
    registerDesktopContextMenuTarget(target as unknown as Element, {
      targetId: "workspace:1",
      kind: "workspace-file",
      name: "main.ts",
      handlers: {
        "preview-workspace": jest.fn(),
        "copy-workspace-path": jest.fn(),
      },
    });
    const postMessage = jest.fn();
    let hostListener: ((event: unknown, payload: unknown) => void) | undefined;
    const onFromMain = jest.fn((channel, listener) => {
      expect(channel).toBe(SERVICE_WEBVIEW_BRIDGE_ACTION_CHANNEL);
      hostListener = listener;
      return jest.fn();
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        electronAPI: { onFromMain },
        location: { href: "http://127.0.0.1/ui/" },
        postMessage,
      },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { elementFromPoint: () => target },
    });

    initializeDesktopContextMenuBridge();
    hostListener?.({}, {
      action: "contextMenu.resolve",
      version: 1,
      requestId: "request-1",
      x: 10,
      y: 20,
    });

    expect(postMessage).toHaveBeenCalledWith({
      type: WEBVIEW_CONTEXT_MENU_SEMANTIC_RESPONSE_CHANNEL,
      version: 1,
      requestId: "request-1",
      target: {
        version: 1,
        targetId: "workspace:1",
        kind: "workspace-file",
        name: "main.ts",
        capabilities: ["workspace.preview", "workspace.copy-path"],
      },
    }, "*");
    const serialized = JSON.stringify(postMessage.mock.calls[0]?.[0]);
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("/api/resource");
    expect(serialized).not.toContain("menuTitle");
    expect(serialized).not.toContain("content");
  });

  it("re-resolves coordinates and silently ignores stale target ids", () => {
    const target: FakeElement = { parentElement: null };
    const copy = jest.fn();
    registerDesktopContextMenuTarget(target as unknown as Element, {
      targetId: "message:live",
      kind: "message",
      handlers: { "copy-content": copy },
    });
    let currentTarget: FakeElement | null = target;
    let hostListener: ((event: unknown, payload: unknown) => void) | undefined;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        electronAPI: {
          onFromMain: (_channel: string, listener: typeof hostListener) => {
            hostListener = listener;
          },
        },
        location: { href: "http://127.0.0.1/ui/" },
        postMessage: jest.fn(),
      },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { elementFromPoint: () => currentTarget },
    });
    initializeDesktopContextMenuBridge();
    const command = {
      action: "contextMenu.execute",
      version: 1,
      targetKind: "message",
      command: "copy-content",
      x: 10,
      y: 20,
    };

    hostListener?.({}, { ...command, targetId: "message:stale" });
    currentTarget = null;
    hostListener?.({}, { ...command, targetId: "message:live" });
    expect(copy).not.toHaveBeenCalled();

    currentTarget = target;
    hostListener?.({}, { ...command, targetId: "message:live" });
    expect(copy).toHaveBeenCalledTimes(1);
  });

  it("does not install any browser listener when the Desktop bridge is absent", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { addEventListener: jest.fn() },
    });
    const cleanup = initializeDesktopContextMenuBridge();
    cleanup();
    expect((globalThis.window as unknown as { addEventListener: jest.Mock }).addEventListener)
      .not.toHaveBeenCalled();
  });

  it("downloads only through the Resource Viewer registered current-target handler", async () => {
    let hostListener: ((event: unknown, payload: unknown) => void) | undefined;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        electronAPI: {
          onFromMain: (_channel: string, listener: typeof hostListener) => {
            hostListener = listener;
          },
        },
        location: { href: "http://127.0.0.1/ui/" },
        postMessage: jest.fn(),
      },
    });
    const download = jest.fn(async () => undefined);
    const unregister = registerDesktopCurrentResourceDownload(download);
    initializeDesktopContextMenuBridge();

    hostListener?.({}, {
      action: AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION,
      version: AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION,
    });
    await Promise.resolve();
    expect(download).toHaveBeenCalledTimes(1);

    unregister();
    hostListener?.({}, {
      action: AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION,
      version: AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION,
    });
    hostListener?.({}, {
      action: AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION,
      version: 999,
    });
    await Promise.resolve();
    expect(download).toHaveBeenCalledTimes(1);
  });
});
