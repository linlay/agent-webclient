const CLIENT_DEVICE_ID_STORAGE_KEY = "agent-webclient.deviceId.v1";
const CLIENT_DEVICE_ID_MAX_LENGTH = 128;

let cachedClientDeviceId = "";

function normalizeClientDeviceId(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, CLIENT_DEVICE_ID_MAX_LENGTH);
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function createClientDeviceId(): string {
  try {
    const cryptoRef = globalThis.crypto;
    if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
      return normalizeClientDeviceId(`web-${cryptoRef.randomUUID()}`);
    }
  } catch {
    // Fall through to the non-crypto fallback.
  }
  return normalizeClientDeviceId(
    `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
  );
}

export function getClientDeviceId(): string {
  if (cachedClientDeviceId) {
    return cachedClientDeviceId;
  }
  const storage = getStorage();
  const stored = normalizeClientDeviceId(
    storage?.getItem(CLIENT_DEVICE_ID_STORAGE_KEY),
  );
  if (stored) {
    cachedClientDeviceId = stored;
    return cachedClientDeviceId;
  }
  cachedClientDeviceId = createClientDeviceId();
  try {
    storage?.setItem(CLIENT_DEVICE_ID_STORAGE_KEY, cachedClientDeviceId);
  } catch {
    // A memory-only id still keeps the current SPA session usable.
  }
  return cachedClientDeviceId;
}

export function resetClientDeviceIdForTests(): void {
  cachedClientDeviceId = "";
}
