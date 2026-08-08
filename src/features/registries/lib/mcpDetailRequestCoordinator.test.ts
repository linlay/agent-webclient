import { createMcpDetailRequestCoordinator } from "@/features/registries/lib/mcpDetailRequestCoordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("createMcpDetailRequestCoordinator", () => {
  it("reuses the in-flight request for the same connector key", async () => {
    const pending = deferred<string>();
    const requestFactory = jest.fn(() => pending.promise);
    const coordinator = createMcpDetailRequestCoordinator<string>();

    const first = coordinator.run("mcp-servers/demo.yml", requestFactory);
    const second = coordinator.run("mcp-servers/demo.yml", requestFactory);

    expect(requestFactory).toHaveBeenCalledTimes(1);
    expect(second.promise).toBe(first.promise);

    pending.resolve("demo");
    await expect(first.promise).resolves.toBe("demo");
    await expect(second.promise).resolves.toBe("demo");
  });

  it("starts independent requests for different connector keys", () => {
    const requestFactory = jest.fn(() => new Promise<string>(() => undefined));
    const coordinator = createMcpDetailRequestCoordinator<string>();

    coordinator.run("mcp-servers/alpha.yml", requestFactory);
    coordinator.run("mcp-servers/beta.yml", requestFactory);

    expect(requestFactory).toHaveBeenCalledTimes(2);
  });

  it("allows only the latest selection to commit its result", async () => {
    const alpha = deferred<string>();
    const beta = deferred<string>();
    const coordinator = createMcpDetailRequestCoordinator<string>();
    const committed: string[] = [];

    const alphaSelection = coordinator.run(
      "mcp-servers/alpha.yml",
      () => alpha.promise,
    );
    const betaSelection = coordinator.run(
      "mcp-servers/beta.yml",
      () => beta.promise,
    );
    const commit = async (
      selection: ReturnType<typeof coordinator.run>,
    ) => {
      const value = await selection.promise;
      if (coordinator.isLatest(selection.selectionId)) committed.push(value);
    };
    const alphaCommit = commit(alphaSelection);
    const betaCommit = commit(betaSelection);

    beta.resolve("beta");
    await betaCommit;
    alpha.resolve("alpha");
    await alphaCommit;

    expect(committed).toEqual(["beta"]);
  });

  it("promotes a reused request when its connector is selected again", () => {
    const alpha = deferred<string>();
    const beta = deferred<string>();
    const coordinator = createMcpDetailRequestCoordinator<string>();
    const firstAlpha = coordinator.run(
      "mcp-servers/alpha.yml",
      () => alpha.promise,
    );
    coordinator.run("mcp-servers/beta.yml", () => beta.promise);

    const latestAlpha = coordinator.run(
      "mcp-servers/alpha.yml",
      () => Promise.resolve("unexpected"),
    );

    expect(latestAlpha.promise).toBe(firstAlpha.promise);
    expect(coordinator.isLatest(latestAlpha.selectionId)).toBe(true);
  });

  it("clears failed requests so the connector can be retried", async () => {
    const coordinator = createMcpDetailRequestCoordinator<string>();
    const requestFactory = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error("load failed"))
      .mockResolvedValueOnce("recovered");

    const failed = coordinator.run("mcp-servers/demo.yml", requestFactory);
    await expect(failed.promise).rejects.toThrow("load failed");

    const retried = coordinator.run("mcp-servers/demo.yml", requestFactory);
    await expect(retried.promise).resolves.toBe("recovered");
    expect(requestFactory).toHaveBeenCalledTimes(2);
  });

  it("invalidates the current selection without cancelling its request", () => {
    const coordinator = createMcpDetailRequestCoordinator<string>();
    const selection = coordinator.run(
      "mcp-servers/demo.yml",
      () => new Promise<string>(() => undefined),
    );

    coordinator.invalidate();

    expect(coordinator.isLatest(selection.selectionId)).toBe(false);
  });
});
