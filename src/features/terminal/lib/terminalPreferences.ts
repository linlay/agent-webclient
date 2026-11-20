export const MAC_OPTION_IS_META_STORAGE_KEY = "zenmind.terminal.macOptionIsMeta";

type ReadableStorage = Partial<Pick<Storage, "getItem">>;
type WritableStorage = Partial<Pick<Storage, "setItem">>;

export function isMacTerminalPlatform(platformLike?: string): boolean {
  const source =
    platformLike !== undefined
      ? platformLike
      : typeof navigator !== "undefined"
        ? navigator.platform || navigator.userAgent || ""
        : "";
  return /mac|darwin/i.test(source);
}

export function readMacOptionIsMeta(storage?: ReadableStorage | null): boolean {
  try {
    const target = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    return target?.getItem?.(MAC_OPTION_IS_META_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeMacOptionIsMeta(
  enabled: boolean,
  storage?: WritableStorage | null,
): void {
  try {
    const target = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    target?.setItem?.(MAC_OPTION_IS_META_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore storage quota or security restrictions.
  }
}
