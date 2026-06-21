import {
  DesktopScreenshotError,
  captureDesktopScreenshot,
} from "@/shared/api/desktopScreenshot";

const globalWithRuntimeConfig = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("desktopScreenshot bridge", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  afterEach(() => {
    delete globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
    if (originalWindow) {
      (globalThis as unknown as { window?: Window & typeof globalThis }).window =
        originalWindow;
    }
    if (originalDocument) {
      (globalThis as unknown as { document?: Document }).document =
        originalDocument;
    }
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function installDesktopWindow(
    respond: (payload: { requestId: string }) => void,
    options: {
      bridgeFlag?:
        | "__DESKTOP_WEBVIEW_BRIDGE__"
        | "__ZENMIND_DESKTOP_WEBVIEW_BRIDGE__";
      runtimeConfig?: Record<string, unknown>;
      search?: string;
    } = {},
  ) {
    const listeners = new Set<(event: MessageEvent) => void>();
    const bridgeFlag =
      options.bridgeFlag ?? "__ZENMIND_DESKTOP_WEBVIEW_BRIDGE__";
    const mockWindow: any = {
      location: { pathname: "/", search: options.search ?? "" },
      parent: null,
      postMessage: jest.fn((payload: { requestId: string }) => {
        respond(payload);
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
      [bridgeFlag]: true,
    };
    mockWindow.parent = mockWindow;
    (globalThis as unknown as { window?: typeof mockWindow }).window =
      mockWindow;
    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ =
      options.runtimeConfig ?? {
        DESKTOP_APP: "true",
      };
    return {
      mockWindow,
      emit: (data: Record<string, unknown>) => {
        for (const listener of listeners) {
          listener({
            source: mockWindow,
            data,
          } as MessageEvent);
        }
      },
    };
  }

  it("captures a desktop screenshot through the app bridge", async () => {
    const desktop = installDesktopWindow((payload) => {
      queueMicrotask(() => {
        desktop.emit({
          type: "zenmind:desktop-screenshot:capture:response",
          requestId: payload.requestId,
          ok: true,
          dataBase64: "cG5n",
          mimeType: "image/png",
          width: 4,
          height: 3,
          sizeBytes: 3,
        });
      });
    });

    await expect(captureDesktopScreenshot()).resolves.toEqual({
      dataUrl: "data:image/png;base64,cG5n",
      filename: expect.stringMatching(/^screenshot-\d{8}-\d{6}\.png$/),
      height: 3,
      mimeType: "image/png",
      sizeBytes: 3,
      width: 4,
    });
    expect(desktop.mockWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "zenmind:desktop-screenshot:capture",
      }),
      "*",
    );
  });

  it("captures through the current desktop webview bridge flag", async () => {
    const desktop = installDesktopWindow(
      (payload) => {
        queueMicrotask(() => {
          desktop.emit({
            type: "desktop:screenshot:capture:response",
            requestId: payload.requestId,
            ok: true,
            dataBase64: "cG5n",
            mimeType: "image/png",
          });
        });
      },
      {
        bridgeFlag: "__DESKTOP_WEBVIEW_BRIDGE__",
        runtimeConfig: { DESKTOP_APP: "false" },
        search: "?desktopAuthContext=platform%3A202",
      },
    );

    await expect(captureDesktopScreenshot()).resolves.toMatchObject({
      dataUrl: "data:image/png;base64,cG5n",
      mimeType: "image/png",
    });
    expect(desktop.mockWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "desktop:screenshot:capture",
      }),
      "*",
    );
  });

  it("resolves null when the user cancels screenshot selection", async () => {
    const desktop = installDesktopWindow((payload) => {
      queueMicrotask(() => {
        desktop.emit({
          type: "zenmind:desktop-screenshot:capture:response",
          requestId: payload.requestId,
          ok: false,
          cancelled: true,
          message: "已取消截屏。",
        });
      });
    });

    await expect(captureDesktopScreenshot()).resolves.toBeNull();
  });

  it("rejects desktop screenshot failures", async () => {
    const desktop = installDesktopWindow((payload) => {
      queueMicrotask(() => {
        desktop.emit({
          type: "zenmind:desktop-screenshot:capture:response",
          requestId: payload.requestId,
          ok: false,
          message: "没有屏幕录制权限。",
        });
      });
    });

    await expect(captureDesktopScreenshot()).rejects.toThrow(
      "没有屏幕录制权限。",
    );
  });

  it("rejects outside desktop app mode", async () => {
    (globalThis as unknown as { window?: { location: { pathname: string; search: string } } }).window = {
      location: { pathname: "/", search: "" },
    };
    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DESKTOP_APP: "false",
    };

    await expect(captureDesktopScreenshot()).rejects.toMatchObject({
      name: "DesktopScreenshotError",
      code: "unsupported",
    } satisfies Partial<DesktopScreenshotError>);
  });
});
