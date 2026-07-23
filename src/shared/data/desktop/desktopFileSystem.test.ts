import {
  OPEN_PATH_REQUEST_TYPE,
  OPEN_PATH_RESPONSE_TYPE,
  openRegisteredAgentDirectory,
  ProjectFolderSelectionError,
  SELECT_DIRECTORY_REQUEST_TYPE,
  SELECT_DIRECTORY_RESPONSE_TYPE,
  selectProjectFolder,
} from "@/shared/data/desktop/desktopFileSystem";
import { openAgentDirectory } from "@/shared/data/api/client";

jest.mock("@/shared/data/api/client", () => ({
  openAgentDirectory: jest.fn(),
}));

const openAgentDirectoryMock = openAgentDirectory as jest.MockedFunction<
  typeof openAgentDirectory
>;

const globalWithRuntimeConfig = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("desktopFileSystem", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  afterEach(() => {
    delete globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
    openAgentDirectoryMock.mockReset();
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
                type: SELECT_DIRECTORY_RESPONSE_TYPE,
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
      __DESKTOP_WEBVIEW_BRIDGE__: true,
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
        type: SELECT_DIRECTORY_REQUEST_TYPE,
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
                type: SELECT_DIRECTORY_RESPONSE_TYPE,
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
      __DESKTOP_WEBVIEW_BRIDGE__: true,
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

  it("opens a registered directory by identity outside desktop app mode", async () => {
    (globalThis as unknown as { window?: { location: { pathname: string; search: string } } }).window = {
      location: { pathname: "/", search: "" },
    };
    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DESKTOP_APP: "false",
    };
    openAgentDirectoryMock.mockResolvedValue({
      status: 200,
      code: 0,
      msg: "success",
      data: {
        agentKey: "zenmi",
        directoryType: "config",
        directoryPath: "/agents/zenmi",
        opened: true,
      },
    });

    await expect(openRegisteredAgentDirectory({
      agentKey: " zenmi ",
      directoryType: "config",
      desktopPath: " /agents/zenmi ",
    })).resolves.toBe(true);
    expect(openAgentDirectoryMock).toHaveBeenCalledWith({
      agentKey: "zenmi",
      directoryType: "config",
    });
  });

  it("opens the desktop path through the host bridge without calling HTTP", async () => {
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
                type: OPEN_PATH_RESPONSE_TYPE,
                requestId: payload.requestId,
                ok: true,
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
      __DESKTOP_WEBVIEW_BRIDGE__: true,
    };
    mockWindow.parent = mockWindow;
    (globalThis as unknown as { window?: typeof mockWindow }).window = mockWindow;
    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DESKTOP_APP: "true",
    };

    await expect(openRegisteredAgentDirectory({
      agentKey: "zenmi",
      directoryType: "workspace",
      desktopPath: " /workspace/zenmi ",
    })).resolves.toBe(true);

    expect(mockWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: OPEN_PATH_REQUEST_TYPE,
        path: "/workspace/zenmi",
      }),
      "*",
    );
    expect(openAgentDirectoryMock).not.toHaveBeenCalled();
  });

  it("skips invalid directory requests", async () => {
    (globalThis as unknown as { window?: { location: { pathname: string; search: string } } }).window = {
      location: { pathname: "/", search: "" },
    };
    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DESKTOP_APP: "false",
    };

    await expect(openRegisteredAgentDirectory({
      agentKey: " ",
      directoryType: "config",
      desktopPath: "/agents/zenmi",
    })).resolves.toBe(false);
    await expect(openRegisteredAgentDirectory({
      agentKey: "zenmi",
      directoryType: "invalid" as "config",
      desktopPath: "/agents/zenmi",
    })).resolves.toBe(false);

    expect(openAgentDirectoryMock).not.toHaveBeenCalled();
  });

  it("does not post a desktop request without a desktop path", async () => {
    const mockWindow: any = {
      location: { pathname: "/", search: "" },
      parent: null,
      postMessage: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      setTimeout,
      clearTimeout,
      __DESKTOP_WEBVIEW_BRIDGE__: true,
    };
    mockWindow.parent = mockWindow;
    (globalThis as unknown as { window?: typeof mockWindow }).window = mockWindow;
    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DESKTOP_APP: "true",
    };

    await expect(openRegisteredAgentDirectory({
      agentKey: "zenmi",
      directoryType: "workspace",
    })).resolves.toBe(false);

    expect(mockWindow.postMessage).not.toHaveBeenCalled();
    expect(openAgentDirectoryMock).not.toHaveBeenCalled();
  });
});
