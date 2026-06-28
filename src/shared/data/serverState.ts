import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { ApiResponse } from "@/shared/data/client";
import {
  createDataCacheKey,
  type EndpointDefinition,
} from "@/shared/data/endpointRegistry";

export type DataQueryStatus = "idle" | "loading" | "success" | "error";

export interface DataQuerySnapshot<TData = unknown> {
  status: DataQueryStatus;
  data: TData | null;
  error: Error | null;
  updatedAt: number;
  isStale: boolean;
}

interface DataQueryEntry<TData = unknown> {
  snapshot: DataQuerySnapshot<TData>;
  promise: Promise<TData> | null;
  abortController: AbortController | null;
  expiresAt: number;
  lastAccessedAt: number;
  revision: number;
  listeners: Set<() => void>;
}

export interface UseDataQueryOptions {
  enabled?: boolean;
  ttlMs?: number;
  dedupe?: boolean;
}

export interface UseDataQueryResult<TData> extends DataQuerySnapshot<TData> {
  refetch: () => Promise<TData>;
  invalidate: () => void;
}

type QueryFetcher<TInput, TData> = (
  input: TInput,
  options?: { signal?: AbortSignal },
) => Promise<ApiResponse<TData>>;

type CacheFetcher<TData> = (options?: {
  signal?: AbortSignal;
}) => Promise<TData>;

export interface DataQueryCacheOptions {
  maxEntries?: number;
}

const EMPTY_SNAPSHOT: DataQuerySnapshot<unknown> = Object.freeze({
  status: "idle",
  data: null,
  error: null,
  updatedAt: 0,
  isStale: true,
});

function isAbortError(error: unknown): boolean {
  return (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "AbortError"
  ) || (
    error instanceof Error && error.name === "AbortError"
  );
}

export class DataQueryCache {
  private entries = new Map<string, DataQueryEntry>();
  private readonly maxEntries: number;
  private accessCounter = 0;

  constructor(options: DataQueryCacheOptions = {}) {
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 128));
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      entry.abortController?.abort();
    }
    this.entries.clear();
  }

  getSnapshot<TData>(key: string, ttlMs = 0): DataQuerySnapshot<TData> {
    const entry = this.entries.get(key) as DataQueryEntry<TData> | undefined;
    if (!entry) {
      return EMPTY_SNAPSHOT as DataQuerySnapshot<TData>;
    }
    this.touch(entry);
    const isStale = ttlMs > 0 ? Date.now() >= entry.expiresAt : true;
    if (entry.snapshot.isStale !== isStale) {
      entry.snapshot = {
        ...entry.snapshot,
        isStale,
      };
    }
    return entry.snapshot;
  }

  subscribe(key: string, listener: () => void): () => void {
    const entry = this.ensureEntry(key);
    this.touch(entry);
    entry.listeners.add(listener);
    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0) {
        entry.abortController?.abort();
        this.pruneEntries();
      }
    };
  }

  invalidate(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }
    entry.expiresAt = 0;
    entry.revision += 1;
    if (entry.listeners.size === 0) {
      entry.abortController?.abort();
    }
    entry.promise = null;
    entry.abortController = null;
    entry.snapshot = {
      ...entry.snapshot,
      isStale: true,
    };
    this.emit(entry);
  }

  invalidatePrefix(prefix: string): void {
    for (const [key, entry] of this.entries.entries()) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      entry.expiresAt = 0;
      entry.revision += 1;
      if (entry.listeners.size === 0) {
        entry.abortController?.abort();
      }
      entry.promise = null;
      entry.abortController = null;
      entry.snapshot = {
        ...entry.snapshot,
        isStale: true,
      };
      this.emit(entry);
    }
  }

  fetch<TData>(
    key: string,
    fetcher: CacheFetcher<TData>,
    options: { ttlMs?: number; dedupe?: boolean } = {},
  ): Promise<TData> {
    const entry = this.ensureEntry<TData>(key);
    const now = Date.now();
    this.touch(entry);
    const ttlMs = Math.max(0, Number(options.ttlMs || 0));
    const dedupe = options.dedupe !== false;

    if (
      entry.snapshot.status === "success" &&
      ttlMs > 0 &&
      now < entry.expiresAt
    ) {
      return Promise.resolve(entry.snapshot.data as TData);
    }
    if (dedupe && entry.promise) {
      return entry.promise;
    }

    const previousSnapshot = entry.snapshot;
    const abortController =
      typeof AbortController === "function" ? new AbortController() : null;
    entry.snapshot = {
      ...entry.snapshot,
      status: "loading",
      error: null,
      isStale: true,
    };
    entry.abortController = abortController;
    this.emit(entry);

    const requestRevision = entry.revision;
    const promise = fetcher(
      abortController ? { signal: abortController.signal } : undefined,
    )
      .then((data) => {
        if (entry.revision !== requestRevision) {
          return data;
        }
        entry.snapshot = {
          status: "success",
          data,
          error: null,
          updatedAt: Date.now(),
          isStale: false,
        };
        entry.expiresAt = ttlMs > 0 ? Date.now() + ttlMs : 0;
        this.touch(entry);
        this.pruneEntries();
        return data;
      })
      .catch((error) => {
        if (entry.revision !== requestRevision) {
          throw error;
        }
        if (isAbortError(error)) {
          entry.snapshot = previousSnapshot;
          throw error;
        }
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        entry.snapshot = {
          ...entry.snapshot,
          status: "error",
          error: normalizedError,
          updatedAt: Date.now(),
          isStale: true,
        };
        throw normalizedError;
      })
      .finally(() => {
        if (entry.promise === promise) {
          entry.promise = null;
          entry.abortController = null;
        }
        this.emit(entry);
      });

    entry.promise = promise;
    return entry.promise;
  }

  private ensureEntry<TData = unknown>(key: string): DataQueryEntry<TData> {
    let entry = this.entries.get(key) as DataQueryEntry<TData> | undefined;
    if (!entry) {
      entry = {
        snapshot: EMPTY_SNAPSHOT as DataQuerySnapshot<TData>,
        promise: null,
        abortController: null,
        expiresAt: 0,
        lastAccessedAt: this.nextAccessOrder(),
        revision: 0,
        listeners: new Set(),
      };
      this.entries.set(key, entry);
      this.pruneEntries();
    }
    return entry;
  }

  private pruneEntries(): void {
    if (this.entries.size <= this.maxEntries) {
      return;
    }

    const candidates = Array.from(this.entries.entries())
      .filter(([, entry]) => entry.listeners.size === 0 && !entry.promise)
      .sort(([, left], [, right]) => left.lastAccessedAt - right.lastAccessedAt);

    for (const [key] of candidates) {
      if (this.entries.size <= this.maxEntries) {
        break;
      }
      this.entries.delete(key);
    }
  }

  private touch(entry: DataQueryEntry): void {
    entry.lastAccessedAt = this.nextAccessOrder();
  }

  private nextAccessOrder(): number {
    this.accessCounter += 1;
    return this.accessCounter;
  }

  private emit(entry: DataQueryEntry): void {
    for (const listener of entry.listeners) {
      listener();
    }
  }
}

export const dataQueryCache = new DataQueryCache();

export function useDataQuery<TInput, TData>(
  endpoint: EndpointDefinition<TInput>,
  input: TInput,
  fetcher: QueryFetcher<TInput, TData>,
  options: UseDataQueryOptions = {},
): UseDataQueryResult<TData> {
  const ttlMs = options.ttlMs ?? endpoint.cache?.ttlMs ?? 0;
  const dedupe = options.dedupe ?? endpoint.cache?.dedupe ?? true;
  const enabled = options.enabled !== false;
  const cacheKey = useMemo(
    () => createDataCacheKey(endpoint, input),
    [endpoint, input],
  );

  const snapshot = useSyncExternalStore(
    useCallback(
      (listener) => dataQueryCache.subscribe(cacheKey, listener),
      [cacheKey],
    ),
    useCallback(
      () => dataQueryCache.getSnapshot<TData>(cacheKey, ttlMs),
      [cacheKey, ttlMs],
    ),
    useCallback(
      () => dataQueryCache.getSnapshot<TData>(cacheKey, ttlMs),
      [cacheKey, ttlMs],
    ),
  );

  const refetch = useCallback(
    () =>
      dataQueryCache.fetch<TData>(
        cacheKey,
        (requestOptions) =>
          fetcher(input, requestOptions).then((response) => response.data),
        { ttlMs, dedupe },
      ),
    [cacheKey, dedupe, fetcher, input, ttlMs],
  );

  const invalidate = useCallback(() => {
    dataQueryCache.invalidate(cacheKey);
  }, [cacheKey]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (snapshot.status === "idle" || snapshot.isStale) {
      void refetch().catch(() => undefined);
    }
  }, [enabled, refetch, snapshot.isStale, snapshot.status]);

  return {
    ...snapshot,
    refetch,
    invalidate,
  };
}
