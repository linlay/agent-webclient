import {
  AGENT_APP_ACCESS_TOKEN_STORAGE_KEY,
  getAppAccessToken,
  refreshAppAccessToken,
} from './appAuth';

type MockStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  dump: () => Record<string, string>;
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
  storedToken?: string;
  globalToken?: string;
} = {}) {
  const listeners = new Set<(event: MessageEvent) => void>();
  const sessionStorage = createMockStorage(
    options.storedToken
      ? { [AGENT_APP_ACCESS_TOKEN_STORAGE_KEY]: options.storedToken }
      : {},
  );
  const parent = {
    postMessage: jest.fn(),
  };

  const mockWindow = {
    location: { pathname: options.pathname ?? '/appagent' },
    parent,
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
    __AGENT_APP_ACCESS_TOKEN: options.globalToken,
  };

  (globalThis as unknown as { window?: typeof mockWindow }).window = mockWindow;

  return {
    parent,
    sessionStorage,
    dispatchMessage: (event: MessageEvent) => {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

describe('appAuth', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    jest.useRealTimers();
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

  it('uses refreshAccessToken for unauthorized refreshes and times out to null', async () => {
    jest.useFakeTimers();
    const { parent } = installWindow();

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
  });

  it('shares one in-flight bridge refresh request', async () => {
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
    const second = refreshAppAccessToken('unauthorized');

    expect(parent.postMessage).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(50);
    await expect(Promise.all([first, second])).resolves.toEqual([
      'shared-token',
      'shared-token',
    ]);
  });
});
