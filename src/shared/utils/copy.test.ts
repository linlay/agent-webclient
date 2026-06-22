import { copyText } from "@/shared/utils/copy";

const globalWithRuntimeConfig = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("copyText", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    delete globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
    if (typeof originalWindow === "undefined") {
      delete (globalThis as unknown as { window?: Window & typeof globalThis })
        .window;
    } else {
      (globalThis as unknown as { window?: Window & typeof globalThis }).window =
        originalWindow;
    }
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function installDesktopWindow(
    respond: (payload: { requestId: string }) => void,
  ) {
    const listeners = new Set<(event: MessageEvent) => void>();
    const mockWindow: any = {
      location: { pathname: "/", search: "" },
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
      __ZENMIND_DESKTOP_WEBVIEW_BRIDGE__: true,
    };
    mockWindow.parent = mockWindow;
    (globalThis as unknown as { window?: typeof mockWindow }).window =
      mockWindow;
    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
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

  it("uses the canonical desktop clipboard bridge without waiting for browser fallback", async () => {
    jest.useFakeTimers();
    const desktop = installDesktopWindow((payload) => {
      desktop.emit({
        type: "desktop:agent-app-clipboard:response",
        requestId: payload.requestId,
        ok: true,
      });
    });

    const copyPromise = copyText("hello from desktop");

    expect(desktop.mockWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "desktop:agent-app-clipboard:request",
        text: "hello from desktop",
      }),
      "*",
    );
    await expect(copyPromise).resolves.toBeUndefined();
  });
});
