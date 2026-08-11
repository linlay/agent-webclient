const CLIENT_SURFACE_ID_STORAGE_KEY = "agent-webclient.surfaceId.v1";
const CLIENT_SURFACE_ID_MAX_LENGTH = 128;

let cachedClientSurfaceId = "";

function normalizeClientSurfaceId(value: unknown): string {
  return String(value || "").trim().slice(0, CLIENT_SURFACE_ID_MAX_LENGTH);
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage;
    }
    if (typeof sessionStorage !== "undefined") {
      return sessionStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function createClientSurfaceId(): string {
  try {
    const cryptoRef = globalThis.crypto;
    if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
      return normalizeClientSurfaceId(`surface-${cryptoRef.randomUUID()}`);
    }
  } catch {
    // Fall through to the non-crypto fallback.
  }
  return normalizeClientSurfaceId(
    `surface-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
  );
}

function readStoredClientSurfaceId(storage: Storage | null): string {
  try {
    const raw = String(storage?.getItem(CLIENT_SURFACE_ID_STORAGE_KEY) || "").trim();
    if (!raw || Array.from(raw).length > CLIENT_SURFACE_ID_MAX_LENGTH) {
      return "";
    }
    return normalizeClientSurfaceId(raw);
  } catch {
    return "";
  }
}

function isReloadNavigation(): boolean {
  try {
    const performanceRef =
      typeof window !== "undefined" && window.performance
        ? window.performance
        : globalThis.performance;
    const navigationEntries = performanceRef?.getEntriesByType?.("navigation") || [];
    const navigationType = (navigationEntries[0] as PerformanceNavigationTiming | undefined)?.type;
    if (navigationType) {
      return navigationType === "reload";
    }
    return performanceRef?.navigation?.type === 1;
  } catch {
    return false;
  }
}

export function getClientSurfaceId(): string {
  if (cachedClientSurfaceId) {
    return cachedClientSurfaceId;
  }
  const storage = getStorage();
  const storedSurfaceId = isReloadNavigation()
    ? readStoredClientSurfaceId(storage)
    : "";
  cachedClientSurfaceId = storedSurfaceId || createClientSurfaceId();
  try {
    storage?.setItem(CLIENT_SURFACE_ID_STORAGE_KEY, cachedClientSurfaceId);
  } catch {
    // A memory-only id still isolates the current browser tab.
  }
  return cachedClientSurfaceId;
}

export function resetClientSurfaceIdForTests(): void {
  cachedClientSurfaceId = "";
}
