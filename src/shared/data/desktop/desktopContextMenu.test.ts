import {
  initializeDesktopContextMenuBridge,
  registerDesktopCurrentResourceDownload,
  registerDesktopCurrentPreviewReview,
  registerDesktopSelectionActionHandler,
  registerDesktopContextMenuTarget,
  resolveDesktopContextMenuTargetAt,
  SERVICE_WEBVIEW_BRIDGE_ACTION_CHANNEL,
  WEBVIEW_CONTEXT_MENU_SEMANTIC_RESPONSE_CHANNEL,
} from "./desktopContextMenu";
import {
  AGENT_WEBCLIENT_COMPOSER_DRAFT_ACTION,
  AGENT_WEBCLIENT_COMPOSER_DRAFT_VERSION,
  AGENT_WEBCLIENT_SELECTION_ACTION,
  AGENT_WEBCLIENT_SELECTION_ACTION_RESULT_PAGE_EVENT,
  AGENT_WEBCLIENT_SELECTION_ACTION_VERSION,
  AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_ACTION,
  AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_VERSION,
  AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION,
  AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION,
} from "@/shared/contracts/generated/agentWebclientBridge";

type FakeElement = {
  parentElement: FakeElement | null;
};

describe("Desktop context menu semantic bridge", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalDocument = (globalThis as { document?: unknown }).document;
  const originalElement = (globalThis as { Element?: unknown }).Element;
  const originalCustomEvent = (globalThis as { CustomEvent?: unknown }).CustomEvent;

  afterEach(() => {
    if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window");
    else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    if (originalDocument === undefined) Reflect.deleteProperty(globalThis, "document");
    else Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    if (originalElement === undefined) Reflect.deleteProperty(globalThis, "Element");
    else Object.defineProperty(globalThis, "Element", { configurable: true, value: originalElement });
    if (originalCustomEvent === undefined) Reflect.deleteProperty(globalThis, "CustomEvent");
    else Object.defineProperty(globalThis, "CustomEvent", { configurable: true, value: originalCustomEvent });
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

  it("revalidates a live selection and returns only bounded action metadata", async () => {
    class TestElement {
      parentElement: TestElement | null;
      constructor(parentElement: TestElement | null = null) {
        this.parentElement = parentElement;
      }
    }
    Object.defineProperty(globalThis, "Element", {
      configurable: true,
      value: TestElement,
    });
    const target = new TestElement();
    registerDesktopContextMenuTarget(target as unknown as Element, {
      targetId: "message:live",
      kind: "message",
      handlers: { "copy-content": jest.fn() },
    });
    let hostListener: ((event: unknown, payload: Record<string, unknown>) => void) | undefined;
    const dispatched: Array<{ type: string; detail: Record<string, unknown> }> = [];
    Object.defineProperty(globalThis, "CustomEvent", {
      configurable: true,
      value: class TestCustomEvent {
        type: string;
        detail: Record<string, unknown>;
        constructor(type: string, init: { detail: Record<string, unknown> }) {
          this.type = type;
          this.detail = init.detail;
        }
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        electronAPI: {
          onFromMain: (_channel: string, listener: typeof hostListener) => {
            hostListener = listener;
          },
        },
        location: { href: "http://127.0.0.1/ui/" },
        getSelection: () => ({
          isCollapsed: false,
          rangeCount: 1,
          anchorNode: target,
          focusNode: target,
          toString: () => "  selected text  ",
        }),
        dispatchEvent: (event: { type: string; detail: Record<string, unknown> }) => {
          dispatched.push(event);
          return true;
        },
        postMessage: jest.fn(),
      },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { elementFromPoint: () => target },
    });
    const handler = jest.fn(async () => ({
      ok: true,
      handoff: { chatId: "chat-1", runId: "run-1" },
    }));
    const unregister = registerDesktopSelectionActionHandler(handler);
    initializeDesktopContextMenuBridge();
    hostListener?.({}, {
      action: AGENT_WEBCLIENT_SELECTION_ACTION,
      version: AGENT_WEBCLIENT_SELECTION_ACTION_VERSION,
      requestId: "selection-request-1",
      selectionId: "selection-1",
      operation: "more-details",
      targetId: "message:live",
      targetKind: "message",
      start: { x: 10, y: 20 },
      end: { x: 30, y: 40 },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      action: "more-details",
      fragment: expect.objectContaining({
        targetId: "message:live",
        reference: expect.objectContaining({
          type: "selection",
          meta: { text: "selected text", sourceKind: "message" },
        }),
      }),
    }));
    expect(dispatched).toContainEqual({
      type: AGENT_WEBCLIENT_SELECTION_ACTION_RESULT_PAGE_EVENT,
      detail: {
        version: AGENT_WEBCLIENT_SELECTION_ACTION_VERSION,
        requestId: "selection-request-1",
        ok: true,
        handoff: { chatId: "chat-1", runId: "run-1" },
      },
    });
    expect(JSON.stringify(dispatched)).not.toContain("selected text");
    unregister();
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

  it("routes only versioned preview review actions and forwards bounded Composer drafts", () => {
    let hostListener: ((event: unknown, payload: unknown) => void) | undefined;
    const dispatchEvent = jest.fn();
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
        dispatchEvent,
      },
    });
    const previousCustomEvent = globalThis.CustomEvent;
    Object.defineProperty(globalThis, "CustomEvent", {
      configurable: true,
      value: class FakeCustomEvent {
        type: string;
        detail: unknown;
        constructor(type: string, init: { detail: unknown }) {
          this.type = type;
          this.detail = init.detail;
        }
      },
    });
    const review = jest.fn();
    const unregister = registerDesktopCurrentPreviewReview(review);
    initializeDesktopContextMenuBridge();
    const reviewAction = {
      action: AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_ACTION,
      version: AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_VERSION,
      requestId: "review-1",
      operation: "capabilities",
    };
    hostListener?.({}, reviewAction);
    hostListener?.({}, { ...reviewAction, version: 999 });
    expect(review).toHaveBeenCalledTimes(1);
    expect(review).toHaveBeenCalledWith(reviewAction);

    const draftAction = {
      action: AGENT_WEBCLIENT_COMPOSER_DRAFT_ACTION,
      version: AGENT_WEBCLIENT_COMPOSER_DRAFT_VERSION,
      requestId: "draft-1",
      ownerChatId: "chat-1",
      text: "review draft",
    };
    hostListener?.({}, draftAction);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({ detail: draftAction });
    unregister();
    Object.defineProperty(globalThis, "CustomEvent", {
      configurable: true,
      value: previousCustomEvent,
    });
  });
});
