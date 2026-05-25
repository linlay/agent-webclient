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

  it("rejects desktop bridge failures instead of treating them as cancel", async () => {
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
                ok: false,
                message: "已取消选择目录。",
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

    await expect(selectProjectFolder()).rejects.toThrow("已取消选择目录。");
  });

  it("prompts for a browser workspace path outside desktop app mode", async () => {
    const mockWindow: any = {
      location: { pathname: "/", search: "" },
      prompt: jest.fn(() => "/Users/demo/Project/agent-coder"),
    };
    (globalThis as unknown as { window?: typeof mockWindow }).window = mockWindow;
    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DESKTOP_APP: "false",
    };

    await expect(selectProjectFolder()).resolves.toEqual({
      kind: "browser-directory-path",
      workspaceDir: "/Users/demo/Project/agent-coder",
    });
    expect(mockWindow.prompt).toHaveBeenCalledWith(
      "由于浏览器限制，需要输入项目的绝对路径",
      "",
    );
  });

  it("throws unsupported when no prompt is available for browser selection", async () => {
    (globalThis as unknown as { window?: { location: { pathname: string; search: string } } }).window = {
      location: { pathname: "/", search: "" },
    };
    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DESKTOP_APP: "false",
    };

    await expect(selectProjectFolder()).rejects.toMatchObject({
      name: "ProjectFolderSelectionError",
      code: "unsupported",
    } satisfies Partial<ProjectFolderSelectionError>);
  });
});
