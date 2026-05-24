import {
  ProjectFolderSelectionError,
  selectProjectFolder,
} from "@/shared/api/desktopFileSystem";

const globalWithRuntimeConfig = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("desktopFileSystem project folder selection", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  afterEach(() => {
    delete globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
    if (originalWindow) {
      (globalThis as unknown as { window?: Window & typeof globalThis }).window = originalWindow;
    }
    if (originalDocument) {
      (globalThis as unknown as { document?: Document }).document = originalDocument;
    }
    jest.restoreAllMocks();
  });

  it("uses the desktop bridge when DESKTOP_APP is true", async () => {
    const listeners = new Set<(event: MessageEvent) => void>();
    const mockWindow: any = {
      location: { pathname: "/", search: "" },
      parent: null,
      postMessage: jest.fn((payload: { requestId: string }) => {
        queueMicrotask(() => {
          for (const listener of listeners) {
            listener({
              source: mockWindow,
              data: {
                type: "zenmind:desktop-dialog:select-directory:response",
                requestId: payload.requestId,
                ok: true,
                path: "/Users/demo/Project/agent-coder",
              },
            } as MessageEvent);
          }
        });
      }),
      addEventListener: jest.fn((type: string, listener: EventListener) => {
        if (type === "message") {
          listeners.add(listener as unknown as (event: MessageEvent) => void);
        }
      }),
      removeEventListener: jest.fn((type: string, listener: EventListener) => {
        if (type === "message") {
          listeners.delete(listener as unknown as (event: MessageEvent) => void);
        }
      }),
      setTimeout,
      clearTimeout,
      __ZENMIND_DESKTOP_WEBVIEW_BRIDGE__: true,
    };
    mockWindow.parent = mockWindow;
    (globalThis as unknown as { window?: typeof mockWindow }).window = mockWindow;
    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DESKTOP_APP: "true",
    };

    await expect(selectProjectFolder()).resolves.toEqual({
      kind: "desktop-directory",
      workspaceDir: "/Users/demo/Project/agent-coder",
    });
    expect(mockWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "zenmind:desktop-dialog:select-directory",
        mode: "directory",
      }),
      "*",
    );
  });

  it("uses a browser webkitdirectory input outside desktop app mode", async () => {
    const file = new File(["hello"], "README.md", { type: "text/markdown" });
    Object.defineProperty(file, "webkitRelativePath", {
      value: "agent-coder/README.md",
    });
    let createdInput: HTMLInputElement | null = null;
    const appendChild = jest.fn();
    const removeChild = jest.fn();
    const createElement = jest.fn(() => {
      const listeners = new Map<string, EventListener>();
      const attributes = new Map<string, string>();
      const input = {
        type: "",
        multiple: false,
        webkitdirectory: false,
        style: {},
        files: [file],
        parentNode: null,
        setAttribute: jest.fn((name: string, value: string) => {
          attributes.set(name, value);
        }),
        getAttribute: jest.fn((name: string) => attributes.get(name) ?? null),
        addEventListener: jest.fn((type: string, listener: EventListener) => {
          listeners.set(type, listener);
        }),
        removeEventListener: jest.fn((type: string) => {
          listeners.delete(type);
        }),
        click: jest.fn(() => {
          listeners.get("change")?.(new Event("change"));
        }),
      } as unknown as HTMLInputElement;
      createdInput = input;
      return input;
    });
    (globalThis as unknown as { document?: Partial<Document> }).document = {
      createElement,
      body: {
        appendChild,
        removeChild,
      },
    } as Partial<Document> as Document;
    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DESKTOP_APP: "false",
    };

    await expect(selectProjectFolder()).resolves.toEqual({
      kind: "browser-folder",
      projectName: "agent-coder",
      files: [{ file, relativePath: "agent-coder/README.md" }],
    });
    expect(createdInput?.getAttribute("webkitdirectory")).toBe("");
    expect(appendChild).toHaveBeenCalled();
  });

  it("throws unsupported when no document is available for browser selection", async () => {
    delete (globalThis as Record<string, unknown>).document;
    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DESKTOP_APP: "false",
    };

    await expect(selectProjectFolder()).rejects.toMatchObject({
      name: "ProjectFolderSelectionError",
      code: "unsupported",
    } satisfies Partial<ProjectFolderSelectionError>);
  });
});
