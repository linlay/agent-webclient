import { DataQueryCache } from "@/shared/data/serverState";

describe("DataQueryCache", () => {
  it("returns stable snapshots while data is unchanged", async () => {
    const cache = new DataQueryCache();

    expect(cache.getSnapshot("missing")).toBe(cache.getSnapshot("missing"));

    await cache.fetch("agents", () => Promise.resolve(["agent-a"]), {
      ttlMs: 1_000,
    });

    const firstSnapshot = cache.getSnapshot<string[]>("agents", 1_000);
    const secondSnapshot = cache.getSnapshot<string[]>("agents", 1_000);
    expect(firstSnapshot).toBe(secondSnapshot);
    expect(firstSnapshot).toMatchObject({
      status: "success",
      data: ["agent-a"],
      isStale: false,
    });
  });

  it("dedupes in-flight requests and reuses fresh ttl data", async () => {
    const cache = new DataQueryCache();
    const fetcher = jest.fn(() => Promise.resolve(["agent-a"]));

    const first = cache.fetch("agents", fetcher, { ttlMs: 1_000 });
    const second = cache.fetch("agents", fetcher, { ttlMs: 1_000 });

    await expect(Promise.all([first, second])).resolves.toEqual([
      ["agent-a"],
      ["agent-a"],
    ]);
    await expect(
      cache.fetch("agents", jest.fn(() => Promise.resolve(["agent-b"])), {
        ttlMs: 1_000,
      }),
    ).resolves.toEqual(["agent-a"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("evicts least-recently-used inactive entries when the cache is full", async () => {
    const cache = new DataQueryCache({ maxEntries: 2 });

    await cache.fetch("agents", () => Promise.resolve(["agent-a"]), {
      ttlMs: 1_000,
    });
    await cache.fetch("teams", () => Promise.resolve(["team-a"]), {
      ttlMs: 1_000,
    });
    cache.getSnapshot("agents", 1_000);
    await cache.fetch("chats", () => Promise.resolve(["chat-a"]), {
      ttlMs: 1_000,
    });

    expect(cache.size).toBe(2);
    expect(cache.getSnapshot("agents", 1_000).status).toBe("success");
    expect(cache.getSnapshot("teams", 1_000).status).toBe("idle");
    expect(cache.getSnapshot("chats", 1_000).status).toBe("success");
  });

  it("invalidates entries by prefix without clearing unrelated data", async () => {
    const cache = new DataQueryCache();

    await cache.fetch("request:agents.list", () => Promise.resolve(["agent-a"]), {
      ttlMs: 1_000,
    });
    await cache.fetch("request:teams.list", () => Promise.resolve(["team-a"]), {
      ttlMs: 1_000,
    });

    cache.invalidatePrefix("request:agents");

    expect(cache.getSnapshot("request:agents.list", 1_000).isStale).toBe(true);
    expect(cache.getSnapshot("request:teams.list", 1_000).isStale).toBe(false);
  });

  it("keeps invalidated in-flight responses from overwriting fresh data", async () => {
    const cache = new DataQueryCache();
    let resolveStale!: (data: string[]) => void;

    const staleRequest = cache.fetch(
      "request:agents.list",
      () =>
        new Promise<string[]>((resolve) => {
          resolveStale = resolve;
        }),
      { ttlMs: 1_000 },
    );

    cache.invalidatePrefix("request:agents");

    await cache.fetch("request:agents.list", () => Promise.resolve(["fresh"]), {
      ttlMs: 1_000,
    });
    resolveStale(["stale"]);
    await expect(staleRequest).resolves.toEqual(["stale"]);

    expect(cache.getSnapshot<string[]>("request:agents.list", 1_000).data).toEqual([
      "fresh",
    ]);
  });

  it("aborts an in-flight request after the last subscriber leaves", async () => {
    const cache = new DataQueryCache();
    const unsubscribe = cache.subscribe("slow", jest.fn());
    let capturedSignal: AbortSignal | undefined;

    const request = cache.fetch("slow", ({ signal } = {}) => {
      capturedSignal = signal;
      return new Promise<unknown[]>((_, reject) => {
        signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });

    unsubscribe();

    expect(capturedSignal?.aborted).toBe(true);
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(cache.getSnapshot("slow")).toMatchObject({ status: "idle" });
  });
});
