export interface ObjectUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export interface ObjectUrlLease {
  url: string;
  revoke(): void;
}

/** Preserves a specific response MIME and only repairs missing/generic Blob metadata. */
export function withBlobMimeTypeFallback(blob: Blob, fallbackMimeType: string): Blob {
  const normalizedFallback = String(fallbackMimeType || "").trim().toLowerCase();
  const currentType = String(blob.type || "").trim().toLowerCase();
  if (
    !normalizedFallback
    || (currentType && currentType !== "application/octet-stream")
  ) {
    return blob;
  }
  return blob.slice(0, blob.size, normalizedFallback);
}

/** Creates an idempotent object-URL lease for effect cleanup. */
export function createObjectUrlLease(
  blob: Blob,
  urlApi: ObjectUrlApi = URL,
): ObjectUrlLease {
  const url = urlApi.createObjectURL(blob);
  let revoked = false;

  return {
    url,
    revoke: () => {
      if (revoked) return;
      revoked = true;
      urlApi.revokeObjectURL(url);
    },
  };
}

export interface AuthenticatedResourceCacheState {
  url: string;
  loading: boolean;
  error: unknown;
}

export interface AuthenticatedResourceCacheSubscription {
  state: AuthenticatedResourceCacheState;
  subscribe(listener: (state: AuthenticatedResourceCacheState) => void): void;
  unsubscribe(listener: (state: AuthenticatedResourceCacheState) => void): void;
  /** Releases one subscriber reference; the entry idles out when the count drops to zero. */
  release(): void;
}

export interface AuthenticatedResourceBlobCacheOptions {
  maxEntries?: number;
  idleTtlMs?: number;
  urlApi?: ObjectUrlApi;
}

type CacheEntryStatus = "pending" | "ready" | "error";

interface CacheEntry {
  key: string;
  status: CacheEntryStatus;
  url: string;
  error: unknown;
  lease: ObjectUrlLease | null;
  listeners: Set<(state: AuthenticatedResourceCacheState) => void>;
  subscribers: number;
  lastActiveAt: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
  disposed: boolean;
}

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_IDLE_TTL_MS = 60_000;

function snapshotEntry(entry: CacheEntry): AuthenticatedResourceCacheState {
  if (entry.status === "ready") {
    return { url: entry.url, loading: false, error: null };
  }
  if (entry.status === "error") {
    return { url: "", loading: false, error: entry.error };
  }
  return { url: "", loading: true, error: null };
}

/**
 * Module-level shared cache for authenticated resource Blobs.
 *
 * Object-URL leases survive consumer unmount/remount cycles (virtual lists,
 * markdown re-renders, surface switches), so the same resource is fetched
 * only once while at least one consumer keeps it alive. Concurrent requests
 * for the same key are deduplicated, and idle entries are revoked after a
 * TTL. Failed loads are cached too, which prevents retry storms from
 * repeatedly failing sources.
 */
export class AuthenticatedResourceBlobCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private readonly idleTtlMs: number;
  private readonly urlApi: ObjectUrlApi;

  constructor(options: AuthenticatedResourceBlobCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.idleTtlMs = options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS;
    this.urlApi = options.urlApi ?? URL;
  }

  acquire(
    key: string,
    loader: () => Promise<Blob>,
  ): AuthenticatedResourceCacheSubscription {
    let entry = this.entries.get(key);
    if (!entry) {
      this.evictIdleOverflow();
      entry = {
        key,
        status: "pending",
        url: "",
        error: null,
        lease: null,
        listeners: new Set(),
        subscribers: 0,
        lastActiveAt: Date.now(),
        idleTimer: null,
        disposed: false,
      };
      this.entries.set(key, entry);
      this.startLoad(entry, loader);
    } else if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }
    entry.subscribers += 1;
    entry.lastActiveAt = Date.now();
    return {
      state: snapshotEntry(entry),
      subscribe: (listener) => {
        entry.listeners.add(listener);
      },
      unsubscribe: (listener) => {
        entry.listeners.delete(listener);
      },
      release: () => this.release(entry),
    };
  }

  size(): number {
    return this.entries.size;
  }

  private startLoad(entry: CacheEntry, loader: () => Promise<Blob>): void {
    void Promise.resolve()
      .then(() => loader())
      .then((blob) => {
        if (entry.disposed) return;
        entry.lease = createObjectUrlLease(blob, this.urlApi);
        entry.url = entry.lease.url;
        entry.status = "ready";
        entry.error = null;
        this.notify(entry);
      })
      .catch((error: unknown) => {
        if (entry.disposed) return;
        entry.status = "error";
        entry.error = error;
        entry.url = "";
        this.notify(entry);
      });
  }

  private release(entry: CacheEntry): void {
    entry.subscribers = Math.max(0, entry.subscribers - 1);
    if (entry.subscribers > 0 || entry.disposed) return;
    entry.lastActiveAt = Date.now();
    entry.idleTimer = setTimeout(() => {
      entry.idleTimer = null;
      this.remove(entry);
    }, this.idleTtlMs);
  }

  /** Evicts the least-recently-active idle entry; skips entries still in use. */
  private evictIdleOverflow(): void {
    while (this.entries.size >= this.maxEntries) {
      let oldest: CacheEntry | null = null;
      for (const entry of this.entries.values()) {
        if (entry.subscribers > 0) continue;
        if (!oldest || entry.lastActiveAt < oldest.lastActiveAt) {
          oldest = entry;
        }
      }
      if (!oldest) return;
      this.remove(oldest);
    }
  }

  private remove(entry: CacheEntry): void {
    if (entry.disposed || this.entries.get(entry.key) !== entry) return;
    this.entries.delete(entry.key);
    entry.disposed = true;
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }
    entry.listeners.clear();
    entry.lease?.revoke();
    entry.lease = null;
    entry.url = "";
  }

  private notify(entry: CacheEntry): void {
    const state = snapshotEntry(entry);
    entry.listeners.forEach((listener) => listener(state));
  }
}

/** Shared singleton used by `useAuthenticatedResourceUrl` consumers. */
export const authenticatedResourceBlobCache = new AuthenticatedResourceBlobCache();
