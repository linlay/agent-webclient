import {
  resolveReadonlyActiveRun,
  shouldReplayReadonlySurfaceOnLifecycle,
} from "./useReadonlyRunSurfaceRuntime";

describe("resolveReadonlyActiveRun", () => {
  it("returns the active run for the requested chat", () => {
    expect(resolveReadonlyActiveRun({
      chatId: "chat-1",
      activeRun: { chatId: "chat-1", runId: "run-active", agentKey: "agent-1" },
    })).toEqual({
      chatId: "chat-1",
      runId: "run-active",
      agentKey: "agent-1",
    });
  });

  it("does not subscribe when replay reports no active run", () => {
    expect(resolveReadonlyActiveRun({
      chatId: "chat-1",
      activeRun: null,
    })).toBeNull();
  });

  it("accepts only the active run for the same chat", () => {
    expect(resolveReadonlyActiveRun({
      chatId: "chat-1",
      activeRun: { chatId: "chat-2", runId: "run-active" },
    })).toBeNull();
  });

  it("keeps an explicitly requested historical run read-only", () => {
    expect(resolveReadonlyActiveRun({
      chatId: "chat-1",
      requestedRunId: "run-history",
      activeRun: { chatId: "chat-1", runId: "run-active" },
    })).toBeNull();
  });
});

describe("shouldReplayReadonlySurfaceOnLifecycle", () => {
  it("replays only when a mounted WorkPanel surface returns from hidden to active", () => {
    expect(shouldReplayReadonlySurfaceOnLifecycle(null, true)).toBe(false);
    expect(shouldReplayReadonlySurfaceOnLifecycle(null, false)).toBe(false);
    expect(shouldReplayReadonlySurfaceOnLifecycle(true, true)).toBe(false);
    expect(shouldReplayReadonlySurfaceOnLifecycle(true, false)).toBe(false);
    expect(shouldReplayReadonlySurfaceOnLifecycle(false, false)).toBe(false);
    expect(shouldReplayReadonlySurfaceOnLifecycle(false, true)).toBe(true);
  });
});
