/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TerminalPane } from "@/features/terminal/components/TerminalPane";
import { TerminalWorkspace } from "@/features/terminal/components/TerminalWorkspace";
import { resetTerminalDockPersistenceForTests } from "@/features/terminal/lib/terminalDockPersistence";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type {
  TerminalAccepted,
  TerminalCompletion,
  TerminalExecution,
  TerminalOpenInput,
  TerminalTransport,
} from "@/features/transport/contracts/realtimeTransport";
import type { TerminalHostAdapter } from "@/features/terminal/lib/hostAdapter";

interface MockTerminalRecord {
  readonly options: Record<string, unknown>;
  readonly addons: unknown[];
  readonly writes: Array<string | Uint8Array>;
  readonly unicode: { activeVersion: string };
  readonly linkProviders: Array<{
    provider: { provideLinks: (lineNumber: number, callback: (links: Array<{ range: { start: { x: number; y: number }; end: { x: number; y: number } }; text: string; activate: (event: MouseEvent, text: string) => void }> | undefined) => void) => void };
    dispose: jest.Mock;
  }>;
  selection: string;
  cols: number;
  rows: number;
  element: HTMLElement | undefined;
  dispose: jest.Mock;
  reset: jest.Mock;
  clear: jest.Mock;
  paste: jest.Mock;
  hasSelection: jest.Mock;
  getSelection: jest.Mock;
  registerLinkProvider: jest.Mock;
  setBufferLine: (index: number, text: string) => void;
  focus: jest.Mock;
  refresh: jest.Mock;
  emitData: (data: string) => void;
  triggerKey: (event: Partial<KeyboardEvent>) => boolean;
}

interface MockFitAddonRecord {
  fit: jest.Mock;
}

interface MockWebglAddonRecord {
  dispose: jest.Mock;
  emitContextLoss: () => void;
}

interface MockSearchAddonRecord {
  findNext: jest.Mock;
  findPrevious: jest.Mock;
  clearDecorations: jest.Mock;
}

interface MockWebLinksAddonRecord {
  handler: ((event: MouseEvent, uri: string) => void) | undefined;
}

interface MockSessionRecord {
  readonly input: TerminalOpenInput;
  readonly execution: TerminalExecution;
  readonly write: jest.Mock<Promise<void>, [string]>;
  readonly resize: jest.Mock<Promise<void>, [number, number]>;
  readonly detach: jest.Mock<Promise<void>, []>;
  readonly close: jest.Mock<Promise<void>, []>;
  emitOpened: (terminalId?: string) => void;
  emitEvent: (event: Record<string, unknown>) => void;
}

const mockTerminals: MockTerminalRecord[] = [];
const mockFitAddons: MockFitAddonRecord[] = [];
const mockWebglAddons: MockWebglAddonRecord[] = [];
const mockUnicode11Addons: unknown[] = [];
const mockSearchAddons: MockSearchAddonRecord[] = [];
const mockWebLinksAddons: MockWebLinksAddonRecord[] = [];
const mockSessions: MockSessionRecord[] = [];
const resizeObservers: Array<{
  callback: ResizeObserverCallback;
  targets: Element[];
}> = [];

jest.mock("@xterm/xterm", () => ({
  Terminal: class MockTerminal {
    cols = 80;
    rows = 24;
    options: Record<string, unknown>;
    addons: unknown[] = [];
    writes: Array<string | Uint8Array> = [];
    unicode = { activeVersion: "6" };
    element: HTMLElement | undefined;
    selection = "";
    private bufferLines = new Map<number, string>();
    linkProviders: Array<{
      provider: { provideLinks: (lineNumber: number, callback: (links: Array<{ range: { start: { x: number; y: number }; end: { x: number; y: number } }; text: string; activate: (event: MouseEvent, text: string) => void }> | undefined) => void) => void };
      dispose: jest.Mock;
    }> = [];
    buffer = {
      active: {
        getLine: (index: number) =>
          this.bufferLines.has(index)
            ? { translateToString: () => this.bufferLines.get(index) ?? "" }
            : undefined,
      },
    };
    dispose = jest.fn();
    reset = jest.fn();
    clear = jest.fn();
    paste = jest.fn((text: string) => this.emitData(text));
    hasSelection = jest.fn(() => Boolean(this.selection));
    getSelection = jest.fn(() => this.selection);
    registerLinkProvider = jest.fn((provider) => {
      const entry = { provider, dispose: jest.fn() };
      this.linkProviders.push(entry);
      return { dispose: entry.dispose };
    });
    setBufferLine(index: number, text: string) {
      this.bufferLines.set(index, text);
    }
    focus = jest.fn();
    refresh = jest.fn();
    markers: Array<{ line: number; dispose: jest.Mock }> = [];
    decorations: Array<{ options: Record<string, unknown>; dispose: jest.Mock }> = [];
    registerMarker = jest.fn((cursorYOffset = 0) => {
      const marker = { line: cursorYOffset, dispose: jest.fn() };
      this.markers.push(marker);
      return marker;
    });
    registerDecoration = jest.fn((options: Record<string, unknown>) => {
      const decoration = { options, dispose: jest.fn() };
      this.decorations.push(decoration);
      return decoration;
    });
    private dataListeners = new Set<(data: string) => void>();
    private customKeyHandler: ((event: KeyboardEvent) => boolean) | null = null;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      mockTerminals.push(this);
    }

    loadAddon(addon: unknown) {
      this.addons.push(addon);
    }

    open(container: HTMLElement) {
      const element = document.createElement("div");
      container.appendChild(element);
      this.element = element;
    }

    onData(listener: (data: string) => void) {
      this.dataListeners.add(listener);
      return { dispose: () => this.dataListeners.delete(listener) };
    }

    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
      this.customKeyHandler = handler;
    }

    write(data: string | Uint8Array, callback?: () => void) {
      this.writes.push(data);
      callback?.();
    }

    emitData(data: string) {
      for (const listener of this.dataListeners) listener(data);
    }

    triggerKey(partial: Partial<KeyboardEvent>): boolean {
      const event = {
        type: "keydown",
        key: "",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault: jest.fn(),
        ...partial,
      } as unknown as KeyboardEvent;
      return this.customKeyHandler ? this.customKeyHandler(event) : true;
    }
  },
}));

jest.mock("@xterm/addon-fit", () => ({
  FitAddon: class MockFitAddon {
    fit = jest.fn();
    constructor() {
      mockFitAddons.push(this);
    }
  },
}));

jest.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class MockWebglAddon {
    dispose = jest.fn();
    private contextLossListener: (() => void) | null = null;
    constructor() {
      mockWebglAddons.push(this);
    }
    onContextLoss(listener: () => void) {
      this.contextLossListener = listener;
      return { dispose: jest.fn() };
    }
    emitContextLoss() {
      this.contextLossListener?.();
    }
  },
}));

jest.mock("@xterm/addon-unicode11", () => ({
  Unicode11Addon: class MockUnicode11Addon {
    constructor() {
      mockUnicode11Addons.push(this);
    }
  },
}));

jest.mock("@xterm/addon-search", () => ({
  SearchAddon: class MockSearchAddon {
    findNext = jest.fn(() => true);
    findPrevious = jest.fn(() => true);
    clearDecorations = jest.fn();
    constructor() {
      mockSearchAddons.push(this);
    }
  },
}));

jest.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class MockWebLinksAddon {
    handler: ((event: MouseEvent, uri: string) => void) | undefined;
    constructor(handler?: (event: MouseEvent, uri: string) => void) {
      this.handler = handler;
      mockWebLinksAddons.push(this);
    }
  },
}));

const mockTerminalTransport: TerminalTransport = {
  open(input: TerminalOpenInput): TerminalExecution {
    const terminalId = `term_${mockSessions.length + 1}`;
    let resolveAccepted!: (value: TerminalAccepted) => void;
    let resolveCompletion!: (value: TerminalCompletion) => void;
    const accepted = new Promise<TerminalAccepted>((resolve) => {
      resolveAccepted = resolve;
    });
    const completion = new Promise<TerminalCompletion>((resolve) => {
      resolveCompletion = resolve;
    });
    const write = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);
    const resize = jest.fn<Promise<void>, [number, number]>().mockResolvedValue(undefined);
    const detach = jest.fn<Promise<void>, []>().mockImplementation(async () => {
      resolveCompletion({ reason: "detached", lastSeq: 1 });
    });
    const close = jest.fn<Promise<void>, []>().mockImplementation(async () => {
      resolveCompletion({ reason: "closed", lastSeq: 1 });
    });
    const execution: TerminalExecution = {
      accepted,
      completion,
      getTerminalId: () => terminalId,
      write,
      resize,
      detach,
      close,
    };
    const record: MockSessionRecord = {
      input,
      execution,
      write,
      resize,
      detach,
      close,
      emitOpened: (id = terminalId) => {
        resolveAccepted({
          requestId: "req-1",
          terminalId: id,
          agentKey: input.agentKey,
          terminalKey: input.terminalKey,
        });
        input.onEvent({
          type: "terminal.opened",
          terminalId: id,
          agentKey: input.agentKey,
          terminalKey: input.terminalKey,
        } as unknown as AgentEvent);
      },
      emitEvent: (event) => {
        input.onEvent(event as unknown as AgentEvent);
      },
    };
    mockSessions.push(record);
    return execution;
  },
  subscribeStatus: () => () => undefined,
};

jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({
  useTerminalTransport: () => mockTerminalTransport,
  useOptionalTerminalTransport: () => mockTerminalTransport,
}));

jest.mock("@/app/state/AppContext", () => ({
  useAppState: () => ({ themeMode: "light" }),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params && Object.keys(params).length > 0 ? `${key}:${JSON.stringify(params)}` : key,
  }),
  t: (key: string) => key,
}));

describe("TerminalPane", () => {
  let container: HTMLDivElement;
  let root: Root;
  const previousResizeObserver = Object.getOwnPropertyDescriptor(
    globalThis,
    "ResizeObserver",
  );

  beforeAll(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = false;
    if (previousResizeObserver) {
      Object.defineProperty(globalThis, "ResizeObserver", previousResizeObserver);
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver");
    }
  });

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    resetTerminalDockPersistenceForTests();
    mockTerminals.length = 0;
    mockFitAddons.length = 0;
    mockWebglAddons.length = 0;
    mockUnicode11Addons.length = 0;
    mockSearchAddons.length = 0;
    mockWebLinksAddons.length = 0;
    mockSessions.length = 0;
    resizeObservers.length = 0;
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: class MockResizeObserver {
        private readonly targets: Element[] = [];
        constructor(callback: ResizeObserverCallback) {
          resizeObservers.push({ callback, targets: this.targets });
        }
        observe(target: Element) {
          this.targets.push(target);
        }
        disconnect() {
          // noop
        }
      },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  it("resizes PTY when container height changes even if width is unchanged", async () => {
    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-1",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "light",
          onSessionChange: jest.fn(),
        }),
      );
    });

    const session = mockSessions[0];
    const fitAddon = mockFitAddons[0];
    await act(async () => {
      session.emitOpened();
      jest.advanceTimersByTime(150);
    });

    const observer = resizeObservers[0];
    expect(observer).toBeDefined();
    await act(async () => {
      observer.callback(
        [{ contentRect: { width: 800, height: 400 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
      jest.advanceTimersByTime(150);
    });
    const resizeCallsAfterInitial = session.resize.mock.calls.length;
    const fitCallsAfterInitial = fitAddon.fit.mock.calls.length;

    await act(async () => {
      observer.callback(
        [{ contentRect: { width: 800, height: 220 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
      jest.advanceTimersByTime(150);
    });

    expect(fitAddon.fit.mock.calls.length).toBeGreaterThan(fitCallsAfterInitial);
    expect(session.resize.mock.calls.length).toBeGreaterThan(resizeCallsAfterInitial);
  });

  it("does not detach or reopen existing terminals when adding or switching tabs", async () => {
    await act(async () => {
      root.render(
        React.createElement(TerminalWorkspace, {
          agentKey: "coder",
          worker: { type: "agent", sourceId: "coder", raw: null, row: {} },
        }),
      );
    });

    expect(mockSessions).toHaveLength(1);
    const firstSession = mockSessions[0];
    const firstTerminal = mockTerminals[0];
    await act(async () => {
      firstSession.emitOpened();
    });

    const addButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="terminal.new"]',
    );
    expect(addButton).not.toBeNull();
    await act(async () => {
      addButton!.click();
    });

    expect(mockSessions).toHaveLength(2);
    expect(firstSession.detach).not.toHaveBeenCalled();
    expect(firstTerminal.dispose).not.toHaveBeenCalled();

    const tabs = container.querySelectorAll<HTMLElement>('[role="tab"]');
    expect(tabs).toHaveLength(2);
    await act(async () => {
      tabs[0].click();
    });

    expect(mockSessions).toHaveLength(2);
    expect(firstSession.detach).not.toHaveBeenCalled();
    expect(mockSessions[1].detach).not.toHaveBeenCalled();
    expect(firstTerminal.dispose).not.toHaveBeenCalled();
  });

  it("configures CJK font stack and loads WebGL (with context-loss fallback), Unicode11, WebLinks, and Search addons", async () => {
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);
    try {
      await act(async () => {
        root.render(
          React.createElement(TerminalPane, {
            tabId: "tab-1",
            agentKey: "coder",
            terminalKey: "main",
            availability: { supported: true },
            isActive: true,
            themeMode: "light",
            onSessionChange: jest.fn(),
          }),
        );
      });

      const terminal = mockTerminals[0];
      expect(terminal.options.allowProposedApi).toBe(true);
      expect(String(terminal.options.fontFamily)).toContain("PingFang SC");
      expect(String(terminal.options.fontFamily)).toContain("Microsoft YaHei");
      expect(String(terminal.options.fontFamily)).toContain("Noto Sans Mono CJK SC");
      expect(Number(terminal.options.lineHeight)).toBeGreaterThanOrEqual(1.2);
      expect(terminal.unicode.activeVersion).toBe("11");

      expect(mockWebglAddons).toHaveLength(1);
      expect(mockUnicode11Addons).toHaveLength(1);
      expect(mockWebLinksAddons).toHaveLength(1);
      expect(mockSearchAddons).toHaveLength(1);
      expect(terminal.addons).toContain(mockWebglAddons[0]);
      expect(terminal.addons).toContain(mockUnicode11Addons[0]);
      expect(terminal.addons).toContain(mockWebLinksAddons[0]);
      expect(terminal.addons).toContain(mockSearchAddons[0]);

      mockWebLinksAddons[0].handler?.({} as MouseEvent, "https://example.com");
      expect(openSpy).toHaveBeenCalledWith(
        "https://example.com",
        "_blank",
        "noopener,noreferrer",
      );

      act(() => {
        mockWebglAddons[0].emitContextLoss();
      });
      expect(mockWebglAddons[0].dispose).toHaveBeenCalledTimes(1);
    } finally {
      openSpy.mockRestore();
    }
  });

  it("opens search bar on Cmd/Ctrl+F, searches next/previous, and closes on Escape", async () => {
    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-1",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "light",
          onSessionChange: jest.fn(),
        }),
      );
    });

    const terminal = mockTerminals[0];
    const searchAddon = mockSearchAddons[0];

    let allowXterm = true;
    await act(async () => {
      allowXterm = terminal.triggerKey({ key: "f", ctrlKey: true });
    });
    expect(allowXterm).toBe(false);

    const input = container.querySelector<HTMLInputElement>(
      'input[placeholder="terminal.searchPlaceholder"]',
    );
    expect(input).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "error");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const nextButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="terminal.searchNext"]',
    );
    const prevButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="terminal.searchPrev"]',
    );
    expect(nextButton).not.toBeNull();
    expect(prevButton).not.toBeNull();

    await act(async () => {
      nextButton!.click();
      prevButton!.click();
    });
    expect(searchAddon.findNext).toHaveBeenCalledWith("error");
    expect(searchAddon.findPrevious).toHaveBeenCalledWith("error");

    await act(async () => {
      input!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(
      container.querySelector('input[placeholder="terminal.searchPlaceholder"]'),
    ).toBeNull();
    expect(searchAddon.clearDecorations).toHaveBeenCalled();
    expect(terminal.focus).toHaveBeenCalled();
  });

  it("shows exit code notice and restarts terminal session on restart click", async () => {
    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-1",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "light",
          onSessionChange: jest.fn(),
        }),
      );
    });

    const firstSession = mockSessions[0];
    const firstTerminal = mockTerminals[0];
    await act(async () => {
      firstSession.emitOpened();
      firstSession.emitEvent({
        type: "terminal.exit",
        terminalId: "term_1",
        exitCode: 130,
      });
    });

    expect(
      firstTerminal.writes.some((chunk) => chunk.includes("130")),
    ).toBe(true);

    const restartButton = container.querySelector<HTMLButtonElement>(
      'button[data-terminal-restart="true"]',
    );
    expect(restartButton).not.toBeNull();
    expect(restartButton!.textContent).toBe("terminal.restart");

    await act(async () => {
      restartButton!.click();
    });

    expect(mockSessions).toHaveLength(2);
    expect(mockSessions[1].input.agentKey).toBe("coder");
    expect(mockSessions[1].input.terminalKey).toBe("main");
    expect(
      container.querySelector('button[data-terminal-restart="true"]'),
    ).toBeNull();
  });

  it("sends single keystrokes immediately without batching delay", async () => {
    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-1",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "light",
          onSessionChange: jest.fn(),
        }),
      );
    });

    const session = mockSessions[0];
    const terminal = mockTerminals[0];
    await act(async () => {
      session.emitOpened();
    });

    await act(async () => {
      terminal.emitData("a");
    });

    // Without advancing fake timers, the keystroke must be dispatched immediately.
    expect(session.write).toHaveBeenCalledTimes(1);
    expect(session.write).toHaveBeenCalledWith("a");
  });

  it("chunks pasted input larger than 4 KiB in order without splitting surrogate pairs", async () => {
    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-1",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "light",
          onSessionChange: jest.fn(),
        }),
      );
    });

    const session = mockSessions[0];
    const terminal = mockTerminals[0];
    const writtenOrder: string[] = [];
    session.write.mockImplementation(async (chunk: string) => {
      writtenOrder.push(chunk);
    });
    await act(async () => {
      session.emitOpened();
    });

    const plainPayload = "x".repeat(10000);
    await act(async () => {
      terminal.emitData(plainPayload);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(writtenOrder.map((chunk) => chunk.length)).toEqual([4096, 4096, 1808]);
    expect(writtenOrder.join("")).toBe(plainPayload);

    writtenOrder.length = 0;
    const surrogateBoundaryPayload = "a".repeat(4095) + "😀" + "b".repeat(5000);
    await act(async () => {
      terminal.emitData(surrogateBoundaryPayload);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(writtenOrder.every((chunk) => chunk.length <= 4096)).toBe(true);
    expect(writtenOrder.join("")).toBe(surrogateBoundaryPayload);
    for (const chunk of writtenOrder) {
      expect(chunk).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    }
  });

  it("keeps inactive tabs measurable and avoids remote PTY resize until activated after dock reopen", async () => {
    await act(async () => {
      root.render(
        React.createElement(TerminalWorkspace, {
          agentKey: "coder",
          worker: { type: "agent", sourceId: "coder", raw: null, row: {} },
        }),
      );
    });

    const addButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="terminal.new"]',
    );
    await act(async () => {
      addButton!.click();
    });
    const initialTabs = container.querySelectorAll<HTMLElement>('[role="tab"]');
    await act(async () => {
      initialTabs[0].click();
    });

    // Simulate closing and reopening the TerminalDock while tab 2 is inactive.
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(TerminalWorkspace, {
          agentKey: "coder",
          worker: { type: "agent", sourceId: "coder", raw: null, row: {} },
        }),
      );
    });

    const panes = container.querySelectorAll<HTMLElement>(".terminal-pane");
    expect(panes).toHaveLength(2);
    expect(panes[0].style.display).not.toBe("none");
    expect(panes[0].style.visibility).toBe("visible");
    expect(panes[1].style.display).not.toBe("none");
    expect(panes[1].style.visibility).toBe("hidden");
    expect(panes[1].getAttribute("aria-hidden")).toBe("true");

    const reopenedActiveSession = mockSessions[2];
    const reopenedInactiveSession = mockSessions[3];
    const reopenedInactiveTerminal = mockTerminals[3];

    await act(async () => {
      reopenedActiveSession.emitOpened();
      reopenedInactiveSession.emitOpened();
      reopenedInactiveSession.emitEvent({
        type: "terminal.output",
        data: "previous-output\r\n",
      });
      jest.advanceTimersByTime(150);
    });

    // Inactive tab receives replay without sending a remote PTY resize while hidden.
    expect(reopenedInactiveTerminal.writes).toContain("previous-output\r\n");
    expect(reopenedInactiveSession.resize).not.toHaveBeenCalled();

    // Activating tab 2 restores visibility, refreshes rendering, focuses, and syncs PTY size.
    const reopenedTabs = container.querySelectorAll<HTMLElement>('[role="tab"]');
    await act(async () => {
      reopenedTabs[1].click();
    });
    await act(async () => {
      jest.advanceTimersByTime(150);
    });

    expect(panes[1].style.visibility).toBe("visible");
    expect(panes[1].getAttribute("aria-hidden")).toBe("false");
    expect(reopenedInactiveTerminal.refresh).toHaveBeenCalled();
    expect(reopenedInactiveTerminal.focus).toHaveBeenCalled();
    expect(reopenedInactiveSession.resize).toHaveBeenCalledTimes(1);
  });

  it("skips FitAddon and remote PTY resize when an ancestor container is display:none", async () => {
    container.style.display = "none";

    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-1",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "light",
          onSessionChange: jest.fn(),
        }),
      );
    });

    const session = mockSessions[0];
    const fitAddon = mockFitAddons[0];
    await act(async () => {
      session.emitOpened();
      jest.advanceTimersByTime(150);
    });

    expect(fitAddon.fit).not.toHaveBeenCalled();
    expect(session.resize).not.toHaveBeenCalled();
  });

  it("writes binary output chunks directly to xterm with ack callback and resets xterm only on reconnect replay", async () => {
    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-1",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "light",
          onSessionChange: jest.fn(),
        }),
      );
    });

    const session = mockSessions[0];
    const terminal = mockTerminals[0];
    expect(typeof session.input.onOutput).toBe("function");

    const onWritten = jest.fn();
    const chunk = Uint8Array.from([0x68, 0x69]);
    await act(async () => {
      session.emitOpened();
      session.emitEvent({ type: "terminal.replay.begin", terminalId: "term_1", bytes: 2 });
      session.input.onOutput?.(chunk, onWritten);
      session.emitEvent({ type: "terminal.replay.end", terminalId: "term_1", bytes: 2 });
    });

    expect(terminal.reset).not.toHaveBeenCalled();
    expect(terminal.writes).toContain(chunk);
    expect(onWritten).toHaveBeenCalledTimes(1);

    // Reconnect re-emits terminal.opened + terminal.replay.begin -> clears screen first
    await act(async () => {
      session.emitEvent({ type: "terminal.opened", terminalId: "term_1" });
      session.emitEvent({ type: "terminal.replay.begin", terminalId: "term_1", bytes: 2 });
    });

    expect(terminal.reset).toHaveBeenCalledTimes(1);
  });

  it("reports shell and cwd metadata via onMetaChange when terminal.opened arrives", async () => {
    const onMetaChange = jest.fn();
    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-1",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "light",
          onSessionChange: jest.fn(),
          onMetaChange,
        }),
      );
    });

    const session = mockSessions[0];
    await act(async () => {
      session.emitEvent({
        type: "terminal.opened",
        terminalId: "term_meta",
        shell: "/bin/zsh",
        cwd: "/repo/app",
      });
    });

    expect(onMetaChange).toHaveBeenCalledWith({
      shell: "/bin/zsh",
      cwd: "/repo/app",
    });
  });

  it("writes a session restore divider after replay.end when restored with replay", async () => {
    const restoredAt = new Date(2026, 10, 19, 9, 5, 0, 0).getTime();
    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-1",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "light",
          onSessionChange: jest.fn(),
        }),
      );
    });

    const session = mockSessions[0];
    const terminal = mockTerminals[0];

    await act(async () => {
      session.emitEvent({
        type: "terminal.opened",
        terminalId: "term_1",
        agentKey: "coder",
        terminalKey: "main",
        restored: true,
        restoredAt,
      });
      session.emitEvent({ type: "terminal.replay.begin", terminalId: "term_1" });
      session.input.onOutput("history line\r\n");
    });

    // replay 期间不应提前写入恢复分隔行，避免随后 live 输出前重复插入
    expect(
      terminal.writes.some(
        (chunk) => typeof chunk === "string" && chunk.includes("terminal.sessionRestored"),
      ),
    ).toBe(false);

    await act(async () => {
      session.emitEvent({ type: "terminal.replay.end", terminalId: "term_1" });
      session.input.onOutput("live> ");
    });

    const restoreWrites = terminal.writes.filter(
      (chunk) => typeof chunk === "string" && chunk.includes("terminal.sessionRestored"),
    );
    expect(restoreWrites).toHaveLength(1);
    expect(String(restoreWrites[0])).toContain("09:05");
  });

  it("writes a session restore divider before first live output when restored without replay", async () => {
    const restoredAt = new Date(2026, 10, 19, 14, 20, 0, 0).getTime();
    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-1",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "light",
          onSessionChange: jest.fn(),
        }),
      );
    });

    const session = mockSessions[0];
    const terminal = mockTerminals[0];

    await act(async () => {
      session.emitEvent({
        type: "terminal.opened",
        terminalId: "term_1",
        agentKey: "coder",
        terminalKey: "main",
        restored: true,
        restoredAt,
      });
      session.input.onOutput("prompt> ");
      session.input.onOutput("next");
    });

    const restoreIndexes = terminal.writes
      .map((chunk, idx) =>
        typeof chunk === "string" && chunk.includes("terminal.sessionRestored") ? idx : -1,
      )
      .filter((idx) => idx >= 0);
    expect(restoreIndexes).toHaveLength(1);
    const firstOutputIndex = terminal.writes.findIndex((chunk) => chunk === "prompt> ");
    expect(restoreIndexes[0]).toBeLessThan(firstOutputIndex);
    expect(String(terminal.writes[restoreIndexes[0]])).toContain("14:20");
  });

  it("tracks shell metadata without rendering command decorations or diagnosis banners", async () => {
    const onMetaChange = jest.fn();
    const draftEvents: Array<{ draft?: string }> = [];
    const handleDraft = (event: Event) => {
      draftEvents.push((event as CustomEvent<{ draft?: string }>).detail);
    };
    window.addEventListener("agent:set-composer-draft", handleDraft);

    try {
      await act(async () => {
        root.render(
          React.createElement(TerminalPane, {
            tabId: "tab-1",
            agentKey: "coder",
            terminalKey: "main",
            availability: { supported: true },
            isActive: true,
            themeMode: "light",
            onSessionChange: jest.fn(),
            onMetaChange,
          }),
        );
      });

      const session = mockSessions[0];
      const terminal = mockTerminals[0];

      await act(async () => {
        session.emitEvent({
          type: "terminal.opened",
          terminalId: "term_1",
          agentKey: "coder",
          terminalKey: "main",
          shell: "/bin/zsh",
          cwd: "/repo",
        });
        session.emitEvent({
          type: "shell.cwd",
          terminalId: "term_1",
          cwd: "/repo/sub",
        });
        session.emitEvent({
          type: "shell.title",
          terminalId: "term_1",
          title: "pytest -q",
        });
      });

      expect(onMetaChange).toHaveBeenLastCalledWith({
        shell: "/bin/zsh",
        cwd: "/repo/sub",
        title: "pytest -q",
      });

      await act(async () => {
        session.emitEvent({
          type: "shell.command.start",
          terminalId: "term_1",
          command: "pytest",
        });
        session.input.onOutput("\x1b[31mFAILED test_api\x1b[0m\r\n");
        session.emitEvent({
          type: "shell.command.end",
          terminalId: "term_1",
          command: "pytest",
          exitCode: 1,
        });
      });

      expect(terminal.registerMarker).not.toHaveBeenCalled();
      expect(terminal.registerDecoration).not.toHaveBeenCalled();
      expect(container.querySelector('[data-terminal-command-banner="true"]')).toBeNull();
      expect(container.querySelector('button[data-terminal-diagnose="true"]')).toBeNull();
      expect(draftEvents).toHaveLength(0);
    } finally {
      window.removeEventListener("agent:set-composer-draft", handleDraft);
    }
  });

  it("updates tab title dynamically from shell metadata and inherits active cwd for new tabs", async () => {
    await act(async () => {
      root.render(
        React.createElement(TerminalWorkspace, {
          agentKey: "coder",
          worker: { type: "agent", sourceId: "coder", raw: null, row: {} },
        }),
      );
    });

    expect(mockSessions).toHaveLength(1);
    const firstSession = mockSessions[0];
    const firstTerminal = mockTerminals[0];

    await act(async () => {
      firstSession.emitEvent({
        type: "terminal.opened",
        terminalId: "term_1",
        agentKey: "coder",
        terminalKey: firstSession.input.terminalKey,
        shell: "/bin/zsh",
        cwd: "/repo/initial",
      });
      firstSession.emitEvent({
        type: "shell.cwd",
        terminalId: "term_1",
        cwd: "/repo/sub",
      });
      firstSession.emitEvent({
        type: "shell.title",
        terminalId: "term_1",
        title: "pytest -q",
      });
    });

    const firstTab = container.querySelector<HTMLElement>('[role="tab"]');
    expect(firstTab).not.toBeNull();
    expect(firstTab!.textContent).toContain("pytest -q");

    const addButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="terminal.new"]',
    );
    expect(addButton).not.toBeNull();
    await act(async () => {
      addButton!.click();
    });

    expect(mockSessions).toHaveLength(2);
    expect(mockSessions[1].input.cwd).toBe("/repo/sub");
    expect(firstSession.detach).not.toHaveBeenCalled();
    expect(firstTerminal.dispose).not.toHaveBeenCalled();
  });

  it("updates theme with terminal.refresh and macOptionIsMeta without recreating terminal session", async () => {
    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-theme",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "light",
          macOptionIsMeta: true,
          onSessionChange: () => undefined,
        }),
      );
    });

    expect(mockTerminals).toHaveLength(1);
    expect(mockSessions).toHaveLength(1);
    const terminal = mockTerminals[0];
    expect(terminal.options.macOptionIsMeta).toBe(true);
    terminal.refresh.mockClear();

    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-theme",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "dark",
          macOptionIsMeta: false,
          onSessionChange: () => undefined,
        }),
      );
    });

    expect(mockTerminals).toHaveLength(1);
    expect(mockSessions).toHaveLength(1);
    expect(terminal.dispose).not.toHaveBeenCalled();
    expect(terminal.options.theme).toMatchObject({ background: "#181818" });
    expect(terminal.refresh).toHaveBeenCalledWith(0, terminal.rows - 1);
    expect(terminal.options.macOptionIsMeta).toBe(false);
  });

  it("renders profile dropdown when multiple profiles exist, opens new tab with profile, and toggles macOptionIsMeta on macOS", async () => {
    const previousPlatformDesc = Object.getOwnPropertyDescriptor(window.navigator, "platform");
    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      get: () => "MacIntel",
    });

    try {
      await act(async () => {
        root.render(
          React.createElement(TerminalWorkspace, {
            agentKey: "coder",
            worker: { type: "agent", sourceId: "coder", raw: null, row: {} },
          }),
        );
      });

      expect(mockSessions).toHaveLength(1);
      expect(container.querySelector('button[aria-label="terminal.newProfileMenu"]')).toBeNull();

      const macOptionToggle = container.querySelector<HTMLButtonElement>(
        'button[aria-label="terminal.macOptionIsMeta"]',
      );
      expect(macOptionToggle).not.toBeNull();
      expect(macOptionToggle!.getAttribute("aria-pressed")).toBe("false");

      await act(async () => {
        macOptionToggle!.click();
      });
      expect(macOptionToggle!.getAttribute("aria-pressed")).toBe("true");
      expect(mockTerminals[0].options.macOptionIsMeta).toBe(true);

      await act(async () => {
        mockSessions[0].emitEvent({
          type: "terminal.opened",
          terminalId: "term_1",
          agentKey: "coder",
          terminalKey: mockSessions[0].input.terminalKey,
          shell: "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
          cwd: "C:\\repo",
          profiles: [
            { id: "git-bash", label: "Git Bash", default: true },
            { id: "pwsh", label: "PowerShell 7" },
            { id: "wsl", label: "WSL" },
          ],
        });
      });

      const menuTrigger = container.querySelector<HTMLButtonElement>(
        'button[aria-label="terminal.newProfileMenu"]',
      );
      expect(menuTrigger).not.toBeNull();

      await act(async () => {
        menuTrigger!.click();
      });

      const menuItems = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
      expect(menuItems.map((el) => el.textContent)).toEqual(["Git Bash", "PowerShell 7", "WSL"]);
      const wslItem = menuItems.find((el) => el.textContent === "WSL");
      expect(wslItem).toBeDefined();

      await act(async () => {
        wslItem!.click();
      });

      expect(mockSessions).toHaveLength(2);
      expect(mockSessions[1].input.profile).toBe("wsl");
      expect(container.querySelector('[role="menu"]')).toBeNull();
    } finally {
      if (previousPlatformDesc) {
        Object.defineProperty(window.navigator, "platform", previousPlatformDesc);
      } else {
        Reflect.deleteProperty(window.navigator, "platform");
      }
    }
  });

  it("handles Desktop host context menu actions (copy, paste, clear, reveal-cwd, restart)", async () => {
    let nextMenuAction: "copy" | "paste" | "clear" | "restart" | "reveal-cwd" | null = "copy";
    const adapter: TerminalHostAdapter = {
      kind: "desktop",
      showContextMenu: jest.fn(async () => nextMenuAction),
      revealCwd: jest.fn(async () => ({ ok: true })),
      readClipboardText: jest.fn(async () => "echo pasted\n"),
      writeClipboardText: jest.fn(async () => undefined),
      resolveDroppedFilePaths: jest.fn(() => []),
      subscribeShortcut: jest.fn(() => () => undefined),
      openFileLink: jest.fn(() => true),
    };

    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-ctx",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "light",
          hostAdapter: adapter,
          onSessionChange: () => undefined,
        }),
      );
    });

    const firstSession = mockSessions[0];
    const firstTerminal = mockTerminals[0];
    const hostEl = container.querySelector<HTMLElement>(".terminal-pane-host")!;

    await act(async () => {
      firstSession.emitEvent({
        type: "terminal.opened",
        terminalId: "term_1",
        agentKey: "coder",
        terminalKey: "main",
        shell: "/bin/zsh",
        cwd: "/repo/work",
      });
    });

    // 1. Copy
    firstTerminal.selection = "selected text";
    nextMenuAction = "copy";
    await act(async () => {
      hostEl.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(adapter.showContextMenu).toHaveBeenCalledWith({
      hasSelection: true,
      cwd: "/repo/work",
    });
    expect(adapter.writeClipboardText).toHaveBeenCalledWith("selected text");

    // 2. Paste
    nextMenuAction = "paste";
    await act(async () => {
      hostEl.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(firstTerminal.paste).toHaveBeenCalledWith("echo pasted\n");

    // 3. Clear
    firstTerminal.focus.mockClear();
    firstSession.write.mockClear();
    nextMenuAction = "clear";
    await act(async () => {
      hostEl.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(firstTerminal.clear).toHaveBeenCalledTimes(1);
    expect(firstSession.write).toHaveBeenCalledWith("\x0c");
    expect(firstTerminal.focus).toHaveBeenCalled();

    // 4. Reveal CWD
    nextMenuAction = "reveal-cwd";
    await act(async () => {
      hostEl.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(adapter.revealCwd).toHaveBeenCalledWith("/repo/work");

    // 5. Restart closes live session and opens replacement session
    nextMenuAction = "restart";
    await act(async () => {
      hostEl.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(firstSession.close).toHaveBeenCalledTimes(1);
    expect(mockSessions).toHaveLength(2);
  });

  it("handles subscribed Desktop shortcuts (clear, search, copy, paste) while active", async () => {
    let shortcutListener: ((event: { action: "clear" | "search" | "copy" | "paste" }) => void) | null = null;
    const adapter: TerminalHostAdapter = {
      kind: "desktop",
      showContextMenu: jest.fn(async () => null),
      revealCwd: jest.fn(async () => ({ ok: true })),
      readClipboardText: jest.fn(async () => "pasted-via-shortcut"),
      writeClipboardText: jest.fn(async () => undefined),
      resolveDroppedFilePaths: jest.fn(() => []),
      subscribeShortcut: jest.fn((listener) => {
        shortcutListener = listener;
        return () => {
          shortcutListener = null;
        };
      }),
      openFileLink: jest.fn(() => true),
    };

    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-sc",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "light",
          hostAdapter: adapter,
          onSessionChange: () => undefined,
        }),
      );
    });

    const terminal = mockTerminals[0];
    terminal.selection = "clip";
    await act(async () => {
      shortcutListener?.({ action: "copy" });
      await Promise.resolve();
    });
    expect(adapter.writeClipboardText).toHaveBeenCalledWith("clip");

    await act(async () => {
      shortcutListener?.({ action: "paste" });
      await Promise.resolve();
    });
    expect(terminal.paste).toHaveBeenCalledWith("pasted-via-shortcut");

    await act(async () => {
      shortcutListener?.({ action: "clear" });
      shortcutListener?.({ action: "search" });
    });
    expect(terminal.clear).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".terminal-search-input")).not.toBeNull();
  });

  it("escapes dropped file paths according to active shell dialect and writes to PTY", async () => {
    const adapter: TerminalHostAdapter = {
      kind: "desktop",
      showContextMenu: jest.fn(async () => null),
      revealCwd: jest.fn(async () => ({ ok: true })),
      readClipboardText: jest.fn(async () => ""),
      writeClipboardText: jest.fn(async () => undefined),
      resolveDroppedFilePaths: jest.fn(() => ["/repo/a.ts", "/repo/my file.txt"]),
      subscribeShortcut: jest.fn(() => () => undefined),
      openFileLink: jest.fn(() => true),
    };

    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-drop",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "light",
          hostAdapter: adapter,
          onSessionChange: () => undefined,
        }),
      );
    });

    const session = mockSessions[0];
    await act(async () => {
      session.emitEvent({
        type: "terminal.opened",
        terminalId: "term_1",
        agentKey: "coder",
        terminalKey: "main",
        shell: "/bin/zsh",
        cwd: "/repo",
      });
    });

    const hostEl = container.querySelector<HTMLElement>(".terminal-pane-host")!;
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as unknown as DragEvent & {
      dataTransfer: DataTransfer;
    };
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        files: [new File(["x"], "a.ts")],
        getData: () => "",
      },
    });

    await act(async () => {
      hostEl.dispatchEvent(dropEvent);
    });

    expect(session.write).toHaveBeenCalledWith("/repo/a.ts '/repo/my file.txt'");

    // Switch to PowerShell meta and verify PowerShell quoting on next drop
    await act(async () => {
      session.emitEvent({
        type: "terminal.opened",
        terminalId: "term_1",
        agentKey: "coder",
        terminalKey: "main",
        shell: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
        cwd: "C:\\repo",
      });
    });
    (adapter.resolveDroppedFilePaths as jest.Mock).mockReturnValue(["C:\\My Docs\\it's.ps1"]);

    await act(async () => {
      hostEl.dispatchEvent(dropEvent);
    });
    expect(session.write).toHaveBeenLastCalledWith("'C:\\My Docs\\it''s.ps1'");
  });

  it("registers xterm file:line:col link provider and routes activation through hostAdapter without command decorations", async () => {
    const adapter: TerminalHostAdapter = {
      kind: "desktop",
      showContextMenu: jest.fn(async () => null),
      revealCwd: jest.fn(async () => ({ ok: true })),
      readClipboardText: jest.fn(async () => ""),
      writeClipboardText: jest.fn(async () => undefined),
      resolveDroppedFilePaths: jest.fn(() => []),
      subscribeShortcut: jest.fn(() => () => undefined),
      openFileLink: jest.fn(() => true),
    };

    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-links",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "light",
          hostAdapter: adapter,
          onSessionChange: () => undefined,
        }),
      );
    });

    const session = mockSessions[0];
    const terminal = mockTerminals[0];
    expect(terminal.linkProviders).toHaveLength(1);

    await act(async () => {
      session.emitEvent({
        type: "terminal.opened",
        terminalId: "term_1",
        agentKey: "coder",
        terminalKey: "main",
        shell: "/bin/zsh",
        cwd: "/repo",
      });
      session.emitEvent({
        type: "shell.cwd",
        terminalId: "term_1",
        cwd: "/repo/sub",
      });
    });

    terminal.setBufferLine(0, "ERROR src/app/index.tsx:42:10 - crash");
    let provided: Array<{
      range: { start: { x: number; y: number }; end: { x: number; y: number } };
      text: string;
      activate: (event: MouseEvent, text: string) => void;
    }> | undefined;
    terminal.linkProviders[0].provider.provideLinks(1, (links) => {
      provided = links;
    });

    expect(provided).toHaveLength(1);
    expect(provided![0].range).toEqual({ start: { x: 7, y: 1 }, end: { x: 29, y: 1 } });
    provided![0].activate(new MouseEvent("click"), provided![0].text);

    expect(adapter.openFileLink).toHaveBeenCalledWith({
      agentKey: "coder",
      path: "sub/src/app/index.tsx",
      line: 42,
      col: 10,
    });
    expect((terminal as unknown as { registerDecoration: jest.Mock }).registerDecoration).not.toHaveBeenCalled();
    expect(container.querySelector('[data-terminal-command-banner="true"]')).toBeNull();
  });

  it("re-prompts with Ctrl+L after clear for POSIX and PowerShell, but not for cmd.exe or exited sessions", async () => {
    let shortcutListener: ((event: { action: "clear" | "search" | "copy" | "paste" }) => void) | null = null;
    const adapter: TerminalHostAdapter = {
      kind: "desktop",
      showContextMenu: jest.fn(async () => "clear" as const),
      revealCwd: jest.fn(async () => ({ ok: true })),
      readClipboardText: jest.fn(async () => ""),
      writeClipboardText: jest.fn(async () => undefined),
      resolveDroppedFilePaths: jest.fn(() => []),
      subscribeShortcut: jest.fn((listener) => {
        shortcutListener = listener;
        return () => {
          shortcutListener = null;
        };
      }),
      openFileLink: jest.fn(() => true),
    };

    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-clear-reprompt",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "light",
          hostAdapter: adapter,
          onSessionChange: () => undefined,
        }),
      );
    });

    const session = mockSessions[0];
    const terminal = mockTerminals[0];

    // 1. POSIX (/bin/zsh): clear -> Ctrl+L (\x0c) -> focus
    await act(async () => {
      session.emitEvent({
        type: "terminal.opened",
        terminalId: "term_1",
        agentKey: "coder",
        terminalKey: "main",
        shell: "/bin/zsh",
        cwd: "/repo",
      });
    });
    terminal.clear.mockClear();
    terminal.focus.mockClear();
    session.write.mockClear();

    await act(async () => {
      shortcutListener?.({ action: "clear" });
      await Promise.resolve();
    });
    expect(terminal.clear).toHaveBeenCalledTimes(1);
    expect(session.write).toHaveBeenCalledWith("\x0c");
    expect(terminal.clear.mock.invocationCallOrder[0]).toBeLessThan(
      session.write.mock.invocationCallOrder[0],
    );
    expect(terminal.focus).toHaveBeenCalledTimes(1);

    // 2. PowerShell (pwsh.exe): clear -> Ctrl+L (\x0c) -> focus
    await act(async () => {
      session.emitEvent({
        type: "terminal.opened",
        terminalId: "term_1",
        agentKey: "coder",
        terminalKey: "main",
        shell: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
        cwd: "C:\\repo",
      });
    });
    terminal.clear.mockClear();
    terminal.focus.mockClear();
    session.write.mockClear();

    await act(async () => {
      shortcutListener?.({ action: "clear" });
      await Promise.resolve();
    });
    expect(terminal.clear).toHaveBeenCalledTimes(1);
    expect(session.write).toHaveBeenCalledWith("\x0c");
    expect(terminal.focus).toHaveBeenCalledTimes(1);

    // 3. cmd.exe: clear + focus only, do NOT send Ctrl+L (\x0c)
    await act(async () => {
      session.emitEvent({
        type: "terminal.opened",
        terminalId: "term_1",
        agentKey: "coder",
        terminalKey: "main",
        shell: "C:\\Windows\\System32\\cmd.exe",
        cwd: "C:\\repo",
      });
    });
    terminal.clear.mockClear();
    terminal.focus.mockClear();
    session.write.mockClear();

    await act(async () => {
      shortcutListener?.({ action: "clear" });
      await Promise.resolve();
    });
    expect(terminal.clear).toHaveBeenCalledTimes(1);
    expect(session.write).not.toHaveBeenCalled();
    expect(terminal.focus).toHaveBeenCalledTimes(1);

    // 4. Exited POSIX session: clear + focus only, do NOT write to closed PTY
    await act(async () => {
      session.emitEvent({
        type: "terminal.opened",
        terminalId: "term_1",
        agentKey: "coder",
        terminalKey: "main",
        shell: "/bin/zsh",
        cwd: "/repo",
      });
      session.emitEvent({
        type: "terminal.exit",
        terminalId: "term_1",
        exitCode: 0,
      });
    });
    terminal.clear.mockClear();
    terminal.focus.mockClear();
    session.write.mockClear();

    await act(async () => {
      shortcutListener?.({ action: "clear" });
      await Promise.resolve();
    });
    expect(terminal.clear).toHaveBeenCalledTimes(1);
    expect(session.write).not.toHaveBeenCalled();
    expect(terminal.focus).toHaveBeenCalledTimes(1);
  });

  it("awaits previous session close before opening replacement session on restart, guards against double-restart, and refocuses new terminal", async () => {
    let nextMenuAction: "restart" | null = "restart";
    const adapter: TerminalHostAdapter = {
      kind: "desktop",
      showContextMenu: jest.fn(async () => nextMenuAction),
      revealCwd: jest.fn(async () => ({ ok: true })),
      readClipboardText: jest.fn(async () => ""),
      writeClipboardText: jest.fn(async () => undefined),
      resolveDroppedFilePaths: jest.fn(() => []),
      subscribeShortcut: jest.fn(() => () => undefined),
      openFileLink: jest.fn(() => true),
    };

    await act(async () => {
      root.render(
        React.createElement(TerminalPane, {
          tabId: "tab-restart-guard",
          agentKey: "coder",
          terminalKey: "main",
          availability: { supported: true },
          isActive: true,
          themeMode: "light",
          hostAdapter: adapter,
          onSessionChange: () => undefined,
        }),
      );
    });

    const firstSession = mockSessions[0];
    let resolveClose!: () => void;
    firstSession.close.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveClose = resolve;
        }),
    );

    const hostEl = container.querySelector<HTMLElement>(".terminal-pane-host")!;
    await act(async () => {
      hostEl.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      hostEl.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(firstSession.close).toHaveBeenCalledTimes(1);
    expect(mockSessions).toHaveLength(1);

    await act(async () => {
      resolveClose();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSessions).toHaveLength(2);
    expect(mockTerminals).toHaveLength(2);
    expect(mockTerminals[1].focus).toHaveBeenCalled();
  });
});
