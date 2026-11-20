import {
  isMacTerminalPlatform,
  MAC_OPTION_IS_META_STORAGE_KEY,
  readMacOptionIsMeta,
  writeMacOptionIsMeta,
} from "./terminalPreferences";

describe("terminalPreferences", () => {
  it("detects macOS platforms safely", () => {
    expect(isMacTerminalPlatform("MacIntel")).toBe(true);
    expect(isMacTerminalPlatform("MacARM64")).toBe(true);
    expect(isMacTerminalPlatform("darwin")).toBe(true);
    expect(isMacTerminalPlatform("Win32")).toBe(false);
    expect(isMacTerminalPlatform("Linux x86_64")).toBe(false);
  });

  it("reads and persists macOptionIsMeta preference", () => {
    const store = new Map<string, string>();
    const storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
      removeItem: (key) => {
        store.delete(key);
      },
    };

    expect(readMacOptionIsMeta(storage)).toBe(false);
    writeMacOptionIsMeta(true, storage);
    expect(store.get(MAC_OPTION_IS_META_STORAGE_KEY)).toBe("true");
    expect(readMacOptionIsMeta(storage)).toBe(true);

    writeMacOptionIsMeta(false, storage);
    expect(readMacOptionIsMeta(storage)).toBe(false);
  });

  it("falls back safely when storage throws", () => {
    const throwingStorage: Pick<Storage, "getItem" | "setItem"> = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };

    expect(readMacOptionIsMeta(throwingStorage)).toBe(false);
    expect(() => writeMacOptionIsMeta(true, throwingStorage)).not.toThrow();
  });
});
