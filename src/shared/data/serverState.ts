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
  expiresAt: number;
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

const EMPTY_SNAPSHOT: DataQuerySnapshot<unknown> = Object.freeze({
  status: "idle",
  data: null,
  error: null,
  updatedAt: 0,
  isStale: true,
});

class DataQueryCache {
  private entries = new Map<string, DataQueryEntry>();

  getSnapshot<TData>(key: string, ttlMs = 0): DataQuerySnapshot<TData> {
    const entry = this.entries.get(key) as DataQueryEntry<TData> | undefined;
    if (!entry) {
      return EMPTY_SNAPSHOT as DataQuerySnapshot<TData>;
    }
    return {
      ...entry.snapshot,
      isStale: ttlMs > 0 ? Date.now() >= entry.expiresAt : true,
    };
  }

  subscribe(key: string, listener: () => void): () => void {
    const entry = this.ensureEntry(key);
    entry.listeners.add(listener);
    return () => {
      entry.listeners.delete(listener);
    };
  }

  invalidate(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }
    entry.expiresAt = 0;
    entry.snapshot = {
      ...entry.snapshot,
      isStale: true,
    };
    this.emit(entry);
  }

  fetch<TData>(
    key: string,
    fetcher: () => Promise<TData>,
    options: { ttlMs?: number; dedupe?: boolean } = {},
  ): Promise<TData> {
    const entry = this.ensureEntry<TData>(key);
    const now = Date.now();
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

    entry.snapshot = {
      ...entry.snapshot,
      status: "loading",
      error: null,
      isStale: true,
    };
    this.emit(entry);

    entry.promise = fetcher()
      .then((data) => {
        entry.snapshot = {
          status: "success",
          data,
          error: null,
          updatedAt: Date.now(),
          isStale: false,
        };
        entry.expiresAt = ttlMs > 0 ? Date.now() + ttlMs : 0;
        return data;
      })
      .catch((error) => {
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
        entry.promise = null;
        this.emit(entry);
      });

    return entry.promise;
  }

  private ensureEntry<TData = unknown>(key: string): DataQueryEntry<TData> {
    let entry = this.entries.get(key) as DataQueryEntry<TData> | undefined;
    if (!entry) {
      entry = {
        snapshot: EMPTY_SNAPSHOT as DataQuerySnapshot<TData>,
        promise: null,
        expiresAt: 0,
        listeners: new Set(),
      };
      this.entries.set(key, entry);
    }
    return entry;
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
        () => fetcher(input).then((response) => response.data),
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
