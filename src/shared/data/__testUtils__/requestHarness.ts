import { Blob } from "buffer";
import { configureI18nRuntime, getI18nRuntimeConfig } from "@/shared/i18n/runtime";
import { resetCompactIdStateForTests } from "@/shared/utils/compactId";
import { setAccessToken } from "@/shared/data/api/http";
import { AGENT_APP_ACCESS_TOKEN_STORAGE_KEY, AGENT_APP_AUTH_CONTEXT_STORAGE_KEY } from "@/shared/data/auth/appAuth";

class MockFormData {
  private readonly values = new Map<string, unknown[]>();

  append(name: string, value: unknown, filename?: string): void {
    const current = this.values.get(name) || [];
    if (filename && value instanceof Blob) {
      current.push(new MockFile([value], filename, { type: value.type }));
    } else {
      current.push(value);
    }
    this.values.set(name, current);
  }

  get(name: string): unknown {
    return this.values.get(name)?.[0] ?? null;
  }

  getAll(name: string): unknown[] {
    return this.values.get(name) || [];
  }
}

export class MockFile extends Blob {
  name: string;
  lastModified: number;

  constructor(bits: ConstructorParameters<typeof Blob>[0], name: string, options: FilePropertyBag = {}) {
    super(bits, options);
    this.name = name;
    this.lastModified = options.lastModified ?? Date.now();
  }
}

type MockStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
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
  };
}

export function installWindow(
  options: {
    pathname?: string;
    search?: string;
    storedToken?: string;
  } = {},
) {
  const listeners = new Set<(event: MessageEvent) => void>();
  const sessionStorage = createMockStorage(
    options.storedToken
      ? {
          [AGENT_APP_ACCESS_TOKEN_STORAGE_KEY]: options.storedToken,
          [AGENT_APP_AUTH_CONTEXT_STORAGE_KEY]: "desktop-auth-current",
        }
      : {},
  );
  const parent = {
    postMessage: jest.fn(),
  };
  const mockWindow = {
    location: {
      pathname: options.pathname ?? "/",
      search: options.search ?? "",
    },
    parent,
    __AGENT_APP_AUTH_CONTEXT: options.storedToken
      ? "desktop-auth-current"
      : undefined,
    sessionStorage,
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
    setInterval,
    clearInterval,
  };

  (globalThis as unknown as { window?: typeof mockWindow }).window = mockWindow;
  (
    globalThis as typeof globalThis & {
      __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
    }
  ).__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
    DESKTOP_APP: "true",
  };

  return {
    parent,
    dispatchMessage: (event: MessageEvent) => {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

export function installStandaloneLocalStorage(initial: Record<string, string> = {}) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: createMockStorage(initial),
  });
}

// Register hooks only when a suite opts in; restore every installed browser global.
export function setupRequestHarness() {
  const fetchMock = jest.fn();
  const originalGlobals = Object.fromEntries(
    ["fetch", "Blob", "File", "FormData", "window", "localStorage", "__AGENT_WEBCLIENT_RUNTIME_CONFIG__"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const originalI18n = getI18nRuntimeConfig();

  beforeEach(() => {
    configureI18nRuntime({ locale: "zh-CN" });
    resetCompactIdStateForTests();
    jest.restoreAllMocks();
    global.Blob = Blob as unknown as typeof global.Blob;
    global.File = MockFile as unknown as typeof global.File;
    global.FormData = MockFormData as unknown as typeof global.FormData;
    setAccessToken("");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ code: 0, msg: "ok", data: null }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    setAccessToken("");
    configureI18nRuntime(originalI18n);
    for (const [key, descriptor] of Object.entries(originalGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    jest.restoreAllMocks();

  });

  return { fetchMock };
}
