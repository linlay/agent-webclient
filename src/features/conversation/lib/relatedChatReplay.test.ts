import { buildChatReplayProjection } from "./chatReplayProjection";

function replay(result: unknown, toolName = "run_query", extra = {}) {
  return [...buildChatReplayProjection("parent", { events: [
    { type: "tool.snapshot", chatId: "parent", runId: "parent-run", toolId: "tool", toolName,
            arguments: JSON.stringify({ chatName: "设计讨论" }), timestamp: 1710000000000 },
        { type: "tool.result", chatId: "parent", runId: "parent-run", toolId: "tool", result, timestamp: 1710000000001, ...extra },
  ] }).state.timelineNodes.values()][0];
}
const accepted = { action: "query", accepted: true, run: { chatId: "child", agentKey: "coder", runId: "child-run" } };

describe("run_query related chat replay", () => {
  it.each([accepted, JSON.stringify(accepted)])("restores structured and serialized results", result => {
    expect(replay(result).relatedChat).toEqual({ chatId: "child", agentKey: "coder", title: "设计讨论" });
  });
  it("preserves Team identity", () => {
    expect(replay({ ...accepted, run: { chatId: "child", agentKey: "research" } }).relatedChat?.agentKey).toBe("research");
  });
  it.each([
    "not json", {}, { ...accepted, accepted: false },
    { ...accepted, run: { chatId: "parent" } }, { ...accepted, run: { chatId: 123 } },
  ])("ignores invalid, rejected and current-chat results", result => {
    expect(replay(result).relatedChat).toBeUndefined();
  });
  it("does not turn status calls or failures into links", () => {
    expect(replay(accepted, "run_status").relatedChat).toBeUndefined();
    expect(replay(accepted, "run_query", { error: "failed" }).relatedChat).toBeUndefined();
  });
});
