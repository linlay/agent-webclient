/** @jest-environment jsdom */
import { getConnectorAuthStatus } from "@/shared/data";
import { createConnectorAuthChecks } from "./connectorAuthChecks";
jest.mock("@/shared/data", () => ({ getConnectorAuthStatus: jest.fn() }));
const response = (id: string) => ({ code: 0, msg: "", data: { connectorId: id, sessionId: "", status: "authorized" as const, expiresAt: "" } });
let checks: ReturnType<typeof createConnectorAuthChecks>;
let pending: Map<string, (value: ReturnType<typeof response>) => void>;
beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  checks = createConnectorAuthChecks();
  pending = new Map();
  jest.mocked(getConnectorAuthStatus).mockImplementation(id => new Promise(resolve => pending.set(id, resolve)));
});
afterEach(() => { checks.cancelAll(); jest.useRealTimers(); });

it("reserves capacity for a selected connector when slow background probes occupy both slots", async () => {
  const results = ["slow-a", "slow-b", "waiting", "selected"].map(id => checks.request(id));
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(2);
  checks.prioritize("selected");
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(3);
  expect(pending.has("selected")).toBe(true);
  expect(pending.has("waiting")).toBe(false);
  pending.get("selected")!(response("selected"));
  await results[3];
  expect(pending.has("waiting")).toBe(false);
  pending.get("slow-a")!(response("slow-a"));
  await results[0];
  expect(pending.has("waiting")).toBe(true);
  pending.get("slow-b")!(response("slow-b"));
  pending.get("waiting")!(response("waiting"));
  await Promise.all(results);
});

it("starts the timeout when dispatched and releases a stalled slot without waiting for fetch", async () => {
  const first = checks.request("first").catch(error => error);
  const second = checks.request("second").catch(error => error);
  const queued = checks.request("queued");
  await jest.advanceTimersByTimeAsync(20_000);
  expect((await first).message).toBe("connectors.auth.error.timeout");
  expect((await second).message).toBe("connectors.auth.error.timeout");
  expect(jest.mocked(getConnectorAuthStatus).mock.calls[0][1]?.aborted).toBe(true);
  await jest.advanceTimersByTimeAsync(19_000);
  pending.get("queued")!(response("queued"));
  await expect(queued).resolves.toEqual(response("queued"));
});

it("removes canceled waiting jobs, aborts running ones and ignores late responses", async () => {
  const controller = new AbortController();
  const jobs = [checks.request("first"), checks.request("second"), checks.request("queued", controller.signal)].map(job => job.catch(error => error));
  controller.abort();
  expect((await jobs[2]).name).toBe("AbortError");
  checks.cancelAll();
  expect(getConnectorAuthStatus).toHaveBeenCalledTimes(2);
  expect(jest.mocked(getConnectorAuthStatus).mock.calls.every(([, signal]) => signal?.aborted)).toBe(true);
  pending.get("first")!(response("first"));
  expect((await jobs[0]).name).toBe("AbortError");
  await jobs[1];
  expect(jest.getTimerCount()).toBe(0);
});
