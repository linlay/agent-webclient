import { resolveReadonlyActiveRun } from "./useReadonlyRunSurfaceRuntime";

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
});
