import {
  DESKTOP_WEBS_LIST_REQUEST_TYPE,
  DESKTOP_WEBS_LIST_RESPONSE_TYPE,
  listDesktopWebEntries,
  normalizeDesktopWebEntries,
} from "@/shared/data/desktop/desktopWebs";

const globalWithRuntimeConfig = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

describe("desktopWebs bridge", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    delete globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
    if (originalWindow) {
      (globalThis as unknown as { window?: Window & typeof globalThis }).window =
        originalWindow;
    }
    jest.restoreAllMocks();
  });

  it("normalizes websites and webapps and removes duplicate entry keys", () => {
    expect(
      normalizeDesktopWebEntries([
        {
          id: "docs",
          entryKey: "website:docs",
          label: "Docs",
          kind: "website",
          url: "https://example.com/docs",
          updatedAt: 123,
        },
        {
          id: "docs-duplicate",
          entryKey: "website:docs",
          label: "Duplicate",
          kind: "website",
        },
        {
          id: "local-app",
          label: "Local App",
          kind: "webapp",
          publicUrl: "http://localhost:4173",
        },
        { id: "invalid", label: "Invalid", kind: "other" },
      ]),
    ).toEqual([
      {
        id: "docs",
        entryKey: "website:docs",
        label: "Docs",
        kind: "website",
        url: "https://example.com/docs",
        updatedAt: 123,
      },
      {
        id: "local-app",
        entryKey: "webapp:local-app",
        label: "Local App",
        kind: "webapp",
        url: "http://localhost:4173",
      },
    ]);
  });

  it("lists entries through the Desktop host bridge", async () => {
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
                type: DESKTOP_WEBS_LIST_RESPONSE_TYPE,
                requestId: payload.requestId,
                ok: true,
                items: [
                  {
                    id: "docs",
                    entryKey: "website:docs",
                    label: "Docs",
                    kind: "website",
                  },
                ],
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

    await expect(listDesktopWebEntries()).resolves.toEqual([
      {
        id: "docs",
        entryKey: "website:docs",
        label: "Docs",
        kind: "website",
      },
    ]);
    expect(mockWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: DESKTOP_WEBS_LIST_REQUEST_TYPE,
      }),
      "*",
    );
  });

  it("rejects outside Desktop app mode", async () => {
    (globalThis as unknown as {
      window?: { location: { pathname: string; search: string } };
    }).window = {
      location: { pathname: "/", search: "" },
    };
    globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      DESKTOP_APP: "false",
    };

    await expect(listDesktopWebEntries()).rejects.toThrow(
      "Desktop Sites are unavailable",
    );
  });
});
