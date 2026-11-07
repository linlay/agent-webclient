import { buildChatReplayProjection } from "./chatReplayProjection";
import { replayEvent } from "./conversationReplay";
import { nodesForDetailLevel } from "@/features/timeline/lib/timelineDisplay";
import { serializeRunTranscript } from "@/features/timeline/lib/runTranscript";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
const input = (extra = {}): AgentEvent => ({ type: "request.query", chatId: "chat", runId: "run", requestId: "request", message: "delegated task", timestamp: 1794000000000, origin: { type: "agent", chatId: "sender" }, ...extra } as AgentEvent);
function project(primary?: boolean, event = input()) {
  return buildChatReplayProjection("chat", { primary, events: [event] }).state;
}
it("keeps Work input in replay, timeline and transcript", () => {
  const state = project(false);
  const nodes = [...state.timelineNodes.values()];
  expect(nodes).toHaveLength(1);
  expect(nodes[0].showAgentInput).toBe(true);
  expect(nodesForDetailLevel(nodes, "simple")).toHaveLength(1);
  expect(serializeRunTranscript(nodes[0], [])).toContain("delegated task");
});
it.each(["letter", "reply", "notify", "ask"])("hides %s inputs in Primary", mailKind => {
  expect(project(true, input({ mailKind })).timelineOrder).toHaveLength(0);
});
it("keeps real user input in Primary", () => {
  expect(project(true, input({ origin: { type: "user", userId: "app" } })).timelineOrder).toHaveLength(1);
});
it("recognizes agent origin even when mail envelope fields were removed", () => {
  expect(project(true, input({ mailId: undefined, mailKind: undefined, mailOrigin: undefined, origin: { chatId: "sender", agentKey: "agent" } })).timelineOrder).toHaveLength(0);
});
it("keeps Work input through subsequent observer events", () => {
  const state = project(false);
  replayEvent(state, input({ requestId: "second" }));
  expect(state.timelineOrder).toHaveLength(2);
});
it("waits for authoritative Chat identity", () => {
  expect(project(undefined).timelineOrder).toHaveLength(0);
});

it("trusts origin.type rather than conflicting mail envelope fields", () => {
  expect(project(true, input({ origin: { type: "agent" }, mailOrigin: "user" })).timelineOrder).toHaveLength(0);
  expect(project(true, input({ origin: { type: "user" }, mailOrigin: "agent", mailId: "m", mailKind: "reply" })).timelineOrder).toHaveLength(1);
  expect(project(true, input({ origin: undefined })).timelineOrder).toHaveLength(0);
});
