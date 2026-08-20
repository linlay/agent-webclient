import {
  DESKTOP_NEW_CHAT_PREPARE_REQUEST_TYPE,
  DESKTOP_NEW_CHAT_PREPARE_RESPONSE_TYPE,
  prepareDesktopNewChat,
} from "@/shared/data/desktop/desktopNewChat";

const globalWithRuntimeConfig = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("desktop new Chat preparation bridge", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    delete globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
    if (originalWindow) {
      (globalThis as unknown as { window?: Window & typeof globalThis }).window =
        originalWindow;
    }
    jest.restoreAllMocks();
  });

  it("resolves only after the matching Desktop acknowledgement", async () => {
    const listeners = new Set<(event: MessageEvent) => void>();
    const mockWindow: any = {
      location: { pathname: "/agent/demo", search: "?chatId=chat-old" },
      parent: null,
      postMessage: jest.fn((payload: Record<string, string>) => {
        expect(payload).toEqual(expect.objectContaining({
          type: DESKTOP_NEW_CHAT_PREPARE_REQUEST_TYPE,
          agentKey: "demo",
          sourceChatId: "chat-old",
          newChat: "1783680000000",
        }));
        queueMicrotask(() => {
          for (const listener of listeners) {
            listener({
              source: mockWindow,
              data: {
                type: DESKTOP_NEW_CHAT_PREPARE_RESPONSE_TYPE,
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

    await expect(prepareDesktopNewChat({
      agentKey: "demo",
      sourceChatId: "chat-old",
      newChat: "1783680000000",
    })).resolves.toBeUndefined();
    expect(listeners.size).toBe(0);
  });

  it("rejects a failed Desktop acknowledgement", async () => {
    const listeners = new Set<(event: MessageEvent) => void>();
    const mockWindow: any = {
      location: { pathname: "/agent/demo", search: "?chatId=chat-old" },
      parent: null,
      postMessage: jest.fn((payload: Record<string, string>) => {
        queueMicrotask(() => {
          for (const listener of listeners) {
            listener({
              source: mockWindow,
              data: {
                type: DESKTOP_NEW_CHAT_PREPARE_RESPONSE_TYPE,
                requestId: payload.requestId,
                ok: false,
                message: "stale source",
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
      DESKTOP_APP: true,
    };

    await expect(prepareDesktopNewChat({
      agentKey: "demo",
      sourceChatId: "chat-old",
      newChat: "1783680000000",
    })).rejects.toThrow("stale source");
    expect(listeners.size).toBe(0);
  });
});
