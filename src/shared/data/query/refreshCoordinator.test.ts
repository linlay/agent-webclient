import { RefreshCoordinator } from "./refreshCoordinator";
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
it("shares reads but queues a fresh read after changes, without publishing stale values", async () => {
  const gate = deferred<string>();
  const coordinator = new RefreshCoordinator<string>();
  const fetch = jest.fn().mockReturnValueOnce(gate.promise).mockResolvedValue("new");
  const publish = jest.fn(); const invalidate = jest.fn(); const fail = jest.fn();
  const first = coordinator.read(fetch, invalidate, publish, fail);
  await Promise.resolve();
  expect(coordinator.read(fetch, invalidate, publish, fail)).toBe(first);
  coordinator.read(fetch, invalidate, publish, fail, true);
  coordinator.read(fetch, invalidate, publish, fail, true);
  gate.resolve("old"); await first;
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(publish.mock.calls).toEqual([["new"]]);
});
it("a query rejection cancels publication without scheduling a new check", async () => {
  const gate = deferred<string>(); const publish = jest.fn(); const fetch = jest.fn(() => gate.promise);
  const coordinator = new RefreshCoordinator<string>();
  const result = coordinator.read(fetch, () => {}, publish, () => {});
  await Promise.resolve(); coordinator.cancel(() => {}); gate.resolve("old"); await result;
  expect(publish).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(1);
});
it("uses the newest identity callbacks for a queued refresh", async () => {
  const gate = deferred<string>(); const old = jest.fn(); const next = jest.fn();
  const coordinator = new RefreshCoordinator<string>();
  const result = coordinator.read(() => gate.promise, () => {}, old, () => {});
  await Promise.resolve();
  coordinator.read(async () => "new", () => {}, next, () => {}, true);
  gate.resolve("old"); await result;
  expect(old).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledWith("new");
});
