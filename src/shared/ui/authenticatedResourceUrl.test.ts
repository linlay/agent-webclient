import {
  AuthenticatedResourceBlobCache,
  createObjectUrlLease,
  withBlobMimeTypeFallback,
} from "@/shared/ui/authenticatedResourceUrl";

describe("withBlobMimeTypeFallback", () => {
  it.each(["", "application/octet-stream"])(
    "repairs a generic Blob MIME type: %s",
    (type) => {
      const source = new Blob(["video"], { type });
      const normalized = withBlobMimeTypeFallback(source, "video/mp4");

      expect(normalized).not.toBe(source);
      expect(normalized.type).toBe("video/mp4");
      expect(normalized.size).toBe(source.size);
    },
  );

  it("preserves a specific server MIME type", () => {
    const source = new Blob(["video"], { type: "video/webm" });
    expect(withBlobMimeTypeFallback(source, "video/mp4")).toBe(source);
  });
});

describe("createObjectUrlLease", () => {
  it("revokes the Blob URL exactly once when a resource effect is cleaned up", () => {
    const createObjectURL = jest.fn(() => "blob:resource-preview");
    const revokeObjectURL = jest.fn();
    const lease = createObjectUrlLease(new Blob(["image"]), {
      createObjectURL,
      revokeObjectURL,
    });

    expect(lease.url).toBe("blob:resource-preview");
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    lease.revoke();
    lease.revoke();

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:resource-preview");
  });

  it("releases the previous URL on resource change and the current URL on unmount", () => {
    const createObjectURL = jest
      .fn()
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const revokeObjectURL = jest.fn();
    const urlApi = { createObjectURL, revokeObjectURL };

    const first = createObjectUrlLease(new Blob(["first"]), urlApi);
    first.revoke();
    const second = createObjectUrlLease(new Blob(["second"]), urlApi);
    second.revoke();

    expect(revokeObjectURL.mock.calls).toEqual([
      ["blob:first"],
      ["blob:second"],
    ]);
  });
});

describe("AuthenticatedResourceBlobCache", () => {
  const IDLE_TTL_MS = 60_000;

  interface CacheHarness {
    cache: AuthenticatedResourceBlobCache;
    createObjectURL: jest.Mock;
    revokeObjectURL: jest.Mock;
  }

  function createHarness(options: {
    maxEntries?: number;
  } = {}): CacheHarness {
    let counter = 0;
    const createObjectURL = jest.fn(() => `blob:${counter++}`);
    const revokeObjectURL = jest.fn();
    const cache = new AuthenticatedResourceBlobCache({
      maxEntries: options.maxEntries ?? 100,
      idleTtlMs: IDLE_TTL_MS,
      urlApi: { createObjectURL, revokeObjectURL },
    });
    return { cache, createObjectURL, revokeObjectURL };
  }

  async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
  }

  function blobs(count: number): Blob[] {
    return Array.from({ length: count }, (_, index) => new Blob([`blob-${index}`]));
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("deduplicates concurrent loads and notifies subscribers on success", async () => {
    const { cache, createObjectURL } = createHarness();
    const loader = jest.fn(() => Promise.resolve(blobs(1)[0]));
    const first = cache.acquire("k", loader);
    const second = cache.acquire("k", loader);
    const listener = jest.fn();

    first.subscribe(listener);
    second.subscribe(listener);

    expect(first.state).toEqual({ url: "", loading: true, error: null });

    await flushMicrotasks();

    expect(loader).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      url: "blob:0",
      loading: false,
      error: null,
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    first.release();
    second.release();
  });

  it("reuses the cached Blob URL across unmount/remount cycles", async () => {
    const { cache } = createHarness();
    const loader = jest.fn(() => Promise.resolve(blobs(1)[0]));

    const first = cache.acquire("k", loader);
    await flushMicrotasks();
    first.release();

    const second = cache.acquire("k", loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(second.state).toEqual({ url: "blob:0", loading: false, error: null });

    second.release();
  });

  it("revokes the object URL after the idle TTL elapses", async () => {
    const { cache, revokeObjectURL } = createHarness();
    const loader = jest.fn(() => Promise.resolve(blobs(1)[0]));

    const subscription = cache.acquire("k", loader);
    await flushMicrotasks();
    subscription.release();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    jest.advanceTimersByTime(IDLE_TTL_MS);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:0");
    expect(cache.size()).toBe(0);
  });

  it("cancels idle cleanup when the entry is re-acquired before the TTL", async () => {
    const { cache, revokeObjectURL } = createHarness();
    const loader = jest.fn(() => Promise.resolve(blobs(1)[0]));

    const first = cache.acquire("k", loader);
    await flushMicrotasks();
    first.release();

    const second = cache.acquire("k", loader);
    jest.advanceTimersByTime(IDLE_TTL_MS);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(cache.size()).toBe(1);

    second.release();
    jest.advanceTimersByTime(IDLE_TTL_MS);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("caches failed loads to prevent retry storms", async () => {
    const { cache } = createHarness();
    const error = new Error("load failed");
    const loader = jest.fn(() => Promise.reject(error));

    const first = cache.acquire("k", loader);
    const listener = jest.fn();
    first.subscribe(listener);
    await flushMicrotasks();

    expect(listener).toHaveBeenCalledWith({ url: "", loading: false, error });
    first.release();

    const second = cache.acquire("k", loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(second.state).toEqual({ url: "", loading: false, error });

    second.release();
  });

  it("evicts the least-recently-active idle entry beyond capacity", async () => {
    const { cache, revokeObjectURL } = createHarness({ maxEntries: 2 });
    const [blob0, blob1, blob2] = blobs(3);
    const loader = jest
      .fn()
      .mockResolvedValueOnce(blob0)
      .mockResolvedValueOnce(blob1)
      .mockResolvedValueOnce(blob2);

    const first = cache.acquire("k0", loader);
    await flushMicrotasks();
    first.release();

    const second = cache.acquire("k1", loader);
    await flushMicrotasks();
    second.release();

    const third = cache.acquire("k2", loader);
    expect(cache.size()).toBe(2);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:0");
    expect(third.state).toEqual({ url: "", loading: true, error: null });

    await flushMicrotasks();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);

    third.release();
  });

  it("discards late load results for entries evicted while pending", async () => {
    const { cache, createObjectURL } = createHarness({ maxEntries: 1 });
    const loader = jest
      .fn()
      .mockResolvedValueOnce(blobs(1)[0])
      .mockResolvedValueOnce(blobs(2)[1]);

    const first = cache.acquire("k0", loader);
    first.release();

    const second = cache.acquire("k1", loader);
    const secondListener = jest.fn();
    second.subscribe(secondListener);
    await flushMicrotasks();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledWith({
      url: "blob:0",
      loading: false,
      error: null,
    });

    second.release();
  });
});
