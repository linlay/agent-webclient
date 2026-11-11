import { isEmbedMode } from "@/shared/config/embed";

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() { return entries.size; },
    clear: () => entries.clear(),
    getItem: key => entries.get(key) ?? null,
    key: index => [...entries.keys()][index] ?? null,
    removeItem: key => { entries.delete(key); },
    setItem: (key, value) => { entries.set(String(key), String(value)); },
  };
}
const localMemory = memoryStorage();
const sessionMemory = memoryStorage();
/** Embedded preferences/drafts never read or write the standalone identity's storage. */
export function getClientStorage(kind: "local" | "session"): Storage {
  const fallback = kind === "local" ? localMemory : sessionMemory;
  if (isEmbedMode()) return fallback;
  try {
    const key = kind === "local" ? "localStorage" : "sessionStorage";
    const storage = (typeof window !== "undefined" ? window[key] : undefined) || globalThis[key];
    return storage && typeof storage.getItem === "function" ? storage : fallback;
  }
  catch { return fallback; }
}
