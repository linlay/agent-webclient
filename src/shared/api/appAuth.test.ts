import {
  AGENT_APP_AUTH_CONTEXT_STORAGE_KEY,
  AGENT_APP_ACCESS_TOKEN_STORAGE_KEY,
  getAppAccessToken,
  refreshAppAccessToken,
} from '@/shared/api/appAuth';

type MockStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  dump: () => Record<string, string>;
};

const globalWithRuntimeConfig = globalThis as typeof globalThis & {
  __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
};

function createMockStorage(initial: Record<string, string> = {}): MockStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) || null : null),
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    dump: () => Object.fromEntries(values.entries()),
  };
}

function installWindow(options: {
  pathname?: string;
  search?: string;
  storedToken?: string;
  storedAuthContext?: string;
  globalToken?: string;
  webviewBridge?: boolean;
} = {}) {
  const listeners = new Set<(event: MessageEvent) => void>();
  const sessionStorage = createMockStorage(
    {
      ...(options.storedToken
        ? { [AGENT_APP_ACCESS_TOKEN_STORAGE_KEY]: options.storedToken }
        : {}),
      ...(options.storedAuthContext
        ? { [AGENT_APP_AUTH_CONTEXT_STORAGE_KEY]: options.storedAuthContext }
        : {}),
    },
  );
  const parent = {
    postMessage: jest.fn(),
  };

  const mockWindow: any = {
    location: {
      pathname: options.pathname ?? '/',
      search: options.search ?? '',
    },
    parent,
    postMessage: jest.fn(),
    sessionStorage,
    addEventListener: jest.fn((type: string, listener: EventListener) => {
      if (type === 'message') {
        listeners.add(listener as unknown as (event: MessageEvent) => void);
      }
    }),
    removeEventListener: jest.fn((type: string, listener: EventListener) => {
      if (type === 'message') {
        listeners.delete(listener as unknown as (event: MessageEvent) => void);
      }
    }),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    __AGENT_APP_ACCESS_TOKEN: options.globalToken,
    __ZENMIND_DESKTOP_WEBVIEW_BRIDGE__: options.webviewBridge ? true : undefined,
  };
  if (options.webviewBridge) {
    mockWindow.parent = mockWindow;
  }

  (globalThis as unknown as { window?: typeof mockWindow }).window = mockWindow;
  globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
    DESKTOP_APP: 'true',
  };

  return {
    parent: options.webviewBridge ? mockWindow : parent,
    sessionStorage,
    dispatchMessage: (event: MessageEvent) => {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

function unsignedJwtWithExp(exp: number): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ exp })}.signature`;
}

describe('appAuth', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    jest.useRealTimers();
    delete globalWithRuntimeConfig.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
    if (originalWindow) {
      (globalThis as unknown as { window?: Window & typeof globalThis }).window =
        originalWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  it('prefers the session token over the global bridge token', () => {
    installWindow({
      storedToken: 'session-token',
      globalToken: 'window-token',
    });

    expect(getAppAccessToken()).toBe('session-token');
  });

  it('drops a stored token when the desktop auth context changes', () => {
    const { sessionStorage } = installWindow({
      search: '?desktopAuthContext=platform:202',
      storedAuthContext: 'platform:101',
      storedToken: 'stale-session-token',
      globalToken: 'window-token',
    });

    expect(getAppAccessToken()).toBeNull();
    expect(sessionStorage.dump()[AGENT_APP_ACCESS_TOKEN_STORAGE_KEY]).toBeUndefined();
    expect(sessionStorage.dump()[AGENT_APP_AUTH_CONTEXT_STORAGE_KEY]).toBe(
      'platform:202',
    );
    expect((globalThis.window as typeof globalThis.window & {
      __AGENT_APP_ACCESS_TOKEN?: string;
    }).__AGENT_APP_ACCESS_TOKEN).toBeUndefined();
  });

  it('ignores expired session tokens and falls back to a usable global bridge token', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredToken = unsignedJwtWithExp(nowSeconds - 60);
    const freshToken = unsignedJwtWithExp(nowSeconds + 3600);
    const { sessionStorage } = installWindow({
      storedToken: expiredToken,
      globalToken: freshToken,
    });

    expect(getAppAccessToken()).toBe(freshToken);
    expect(sessionStorage.dump()[AGENT_APP_ACCESS_TOKEN_STORAGE_KEY]).toBeUndefined();
  });

  it('requests a missing token through postMessage and stores the response', async () => {
    const { parent, sessionStorage, dispatchMessage } = installWindow();

    parent.postMessage.mockImplementation((payload: { requestId: string }) => {
      queueMicrotask(() => {
        dispatchMessage({
          source: parent,
          data: {
            type: 'zenmind:agent-app-auth:response',
            requestId: payload.requestId,
            token: 'token-from-host',
          },
        } as MessageEvent);
      });
    });

    await expect(refreshAppAccessToken('missing')).resolves.toBe('token-from-host');
    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'zenmind:agent-app-auth:request',
        action: 'getAccessToken',
        reason: 'missing',
      }),
      '*',
    );
    expect(sessionStorage.dump()[AGENT_APP_ACCESS_TOKEN_STORAGE_KEY]).toBe('token-from-host');
  });

  it('requests a missing token through the webview host bridge when parent is self', async () => {
    const { parent, sessionStorage, dispatchMessage } = installWindow({
      webviewBridge: true,
    });

    (parent.postMessage as jest.Mock).mockImplementation((payload: { requestId: string }) => {
      queueMicrotask(() => {
        dispatchMessage({
          source: parent,
          data: {
            type: 'zenmind:agent-app-auth:response',
            requestId: payload.requestId,
            token: 'webview-token-from-host',
          },
        } as MessageEvent);
      });
    });

    await expect(refreshAppAccessToken('missing')).resolves.toBe('webview-token-from-host');
    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'zenmind:agent-app-auth:request',
        action: 'getAccessToken',
        reason: 'missing',
      }),
      '*',
    );
    expect(sessionStorage.dump()[AGENT_APP_ACCESS_TOKEN_STORAGE_KEY]).toBe(
      'webview-token-from-host',
    );
  });

  it('uses a host-seeded token even when the bridge response requestId differs', async () => {
    jest.useFakeTimers();
    const { parent, sessionStorage } = installWindow({
      webviewBridge: true,
    });

    (parent.postMessage as jest.Mock).mockImplementation(() => {
      setTimeout(() => {
        sessionStorage.setItem(AGENT_APP_ACCESS_TOKEN_STORAGE_KEY, 'seeded-token');
        (globalThis.window as typeof globalThis.window & {
          __AGENT_APP_ACCESS_TOKEN?: string;
        }).__AGENT_APP_ACCESS_TOKEN = 'seeded-token';
      }, 25);
    });

    const promise = refreshAppAccessToken('missing');

    jest.advanceTimersByTime(50);
    await Promise.resolve();

    await expect(promise).resolves.toBe('seeded-token');
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
  });

  it('uses refreshAccessToken for unauthorized refreshes and clears stale stored tokens on timeout', async () => {
    jest.useFakeTimers();
    const { parent, sessionStorage } = installWindow({ storedToken: 'stale-token' });

    const promise = refreshAppAccessToken('unauthorized');

    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'zenmind:agent-app-auth:request',
        action: 'refreshAccessToken',
        reason: 'unauthorized',
      }),
      '*',
    );

    jest.advanceTimersByTime(10_000);
    await expect(promise).resolves.toBeNull();
    expect(sessionStorage.dump()[AGENT_APP_ACCESS_TOKEN_STORAGE_KEY]).toBeUndefined();
  });

  it('uses refreshAccessToken through the webview host bridge instead of falling back to empty', async () => {
    const { parent, sessionStorage, dispatchMessage } = installWindow({
      webviewBridge: true,
      storedToken: 'stale-token',
    });

    (parent.postMessage as jest.Mock).mockImplementation((payload: { requestId: string }) => {
      queueMicrotask(() => {
        dispatchMessage({
          source: parent,
          data: {
            type: 'zenmind:agent-app-auth:response',
            requestId: payload.requestId,
            token: 'fresh-webview-token',
          },
        } as MessageEvent);
      });
    });

    await expect(refreshAppAccessToken('unauthorized')).resolves.toBe('fresh-webview-token');
    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'zenmind:agent-app-auth:request',
        action: 'refreshAccessToken',
        reason: 'unauthorized',
      }),
      '*',
    );
    expect(sessionStorage.dump()[AGENT_APP_ACCESS_TOKEN_STORAGE_KEY]).toBe(
      'fresh-webview-token',
    );
  });

  it('shares one matching in-flight bridge refresh request', async () => {
    jest.useFakeTimers();
    const { parent, dispatchMessage } = installWindow();

    parent.postMessage.mockImplementation((payload: { requestId: string }) => {
      setTimeout(() => {
        dispatchMessage({
          source: parent,
          data: {
            type: 'zenmind:agent-app-auth:response',
            requestId: payload.requestId,
            token: 'shared-token',
          },
        } as MessageEvent);
      }, 50);
    });

    const first = refreshAppAccessToken('missing');
    const second = refreshAppAccessToken('missing');

    expect(parent.postMessage).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(50);
    await expect(Promise.all([first, second])).resolves.toEqual([
      'shared-token',
      'shared-token',
    ]);
  });

  it('does not let an older missing refresh overwrite a newer unauthorized token', async () => {
    jest.useFakeTimers();
    const { parent, sessionStorage, dispatchMessage } = installWindow({
      storedToken: 'stale-token',
    });

    parent.postMessage.mockImplementation((payload: { requestId: string; action: string }) => {
      const token =
        payload.action === 'refreshAccessToken'
          ? 'fresh-unauthorized-token'
          : 'old-missing-token';
      const delay = payload.action === 'refreshAccessToken' ? 10 : 50;
      setTimeout(() => {
        dispatchMessage({
          source: parent,
          data: {
            type: 'zenmind:agent-app-auth:response',
            requestId: payload.requestId,
            token,
          },
        } as MessageEvent);
      }, delay);
    });

    const missing = refreshAppAccessToken('missing');
    const unauthorized = refreshAppAccessToken('unauthorized');

    expect(parent.postMessage).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(10);
    await expect(unauthorized).resolves.toBe('fresh-unauthorized-token');
    expect(sessionStorage.dump()[AGENT_APP_ACCESS_TOKEN_STORAGE_KEY]).toBe(
      'fresh-unauthorized-token',
    );

    jest.advanceTimersByTime(40);
    await expect(missing).resolves.toBe('fresh-unauthorized-token');
    expect(sessionStorage.dump()[AGENT_APP_ACCESS_TOKEN_STORAGE_KEY]).toBe(
      'fresh-unauthorized-token',
    );
  });
});
