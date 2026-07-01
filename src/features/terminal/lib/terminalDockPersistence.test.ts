import {
  persistTerminalDockOpen,
  persistTerminalDockState,
  resetTerminalDockPersistenceForTests,
  restoreTerminalDockOpen,
  restoreTerminalDockState,
} from "@/features/terminal/lib/terminalDockPersistence";

function installLocalStorage(): void {
  const values = new Map<string, string>();
  const storage = {
    getItem: jest.fn((key: string) => values.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: jest.fn((key: string) => {
      values.delete(key);
    }),
    clear: jest.fn(() => {
      values.clear();
    }),
    key: jest.fn((index: number) => Array.from(values.keys())[index] ?? null),
    get length() {
      return values.size;
    },
  } satisfies Storage;
  (globalThis as { localStorage?: Storage }).localStorage = storage;
}

describe("terminalDockPersistence", () => {
  beforeEach(() => {
    installLocalStorage();
    resetTerminalDockPersistenceForTests();
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("persists dock tabs per agent", () => {
    persistTerminalDockState("agent-a", {
      tabs: [
        { id: "tab-1", label: "终端", terminalKey: "main" },
        { id: "tab-2", label: "终端", terminalKey: "tab-1" },
      ],
      activeTabId: "tab-2",
      nextIndex: 2,
    });
    resetTerminalDockPersistenceForTests();

    const restored = restoreTerminalDockState("agent-a", {
      tabs: [],
      activeTabId: "",
      nextIndex: 0,
    });

    expect(restored.activeTabId).toBe("tab-2");
    expect(restored.nextIndex).toBe(2);
    expect(restored.tabs.map((tab) => tab.terminalKey)).toEqual([
      "main",
      "tab-1",
    ]);
  });

  it("falls back when persisted tab data cannot be parsed", () => {
    localStorage.setItem(
      "agent-webclient.terminalDockState.v1:agent-b",
      "{not-json",
    );

    const fallback = {
      tabs: [{ id: "fallback", label: "终端", terminalKey: "main" }],
      activeTabId: "fallback",
      nextIndex: 1,
    };

    expect(restoreTerminalDockState("agent-b", fallback)).toEqual(fallback);
  });

  it("persists dock open state", () => {
    expect(restoreTerminalDockOpen()).toBe(false);

    persistTerminalDockOpen(true);
    expect(restoreTerminalDockOpen()).toBe(true);

    persistTerminalDockOpen(false);
    expect(restoreTerminalDockOpen()).toBe(false);
  });
});
