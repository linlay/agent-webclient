import { buildChatReplayProjection } from "./chatReplayProjection";
import { nodesForDetailLevel } from "@/features/timeline/lib/timelineDisplay";
import { serializeRunTranscript } from "@/features/timeline/lib/runTranscript";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
const input = (extra = {}): AgentEvent => ({ type: "request.query", chatId: "chat", runId: "run", requestId: "request", agentKey: "bot", message: "mail body", timestamp: 1794000000000, ...extra } as AgentEvent);
const fromAgent = (agentKey: string, mailKind?: string) => ({ origin: { type: "agent", agentKey, chatId: "sender" }, ...(mailKind ? { mailId: "mail", mailKind, mailOrigin: "agent" } : {}) });
function nodes(event: AgentEvent, primary?: boolean) {
  return [...buildChatReplayProjection("chat", { primary, events: [event] }).state.timelineNodes.values()];
}

it.each([true, false, undefined])("shows the user's own input in full regardless of Chat identity %s", primary => {
  const [node] = nodes(input({ origin: { type: "user", userId: "app" }, message: "user text" }), primary);
  expect(node).toMatchObject({ role: "user", text: "user text" });
  expect(node.inbound).toBeUndefined();
});
it.each(["reply", "notify"])("keeps only a marker for a child Chat %s in replay, timeline and transcript", mailKind => {
  const [node] = nodes(input(fromAgent("bot", mailKind)), true);
  expect(node).toMatchObject({ text: "", inbound: { kind: mailKind, child: true } });
  expect(nodesForDetailLevel([node], "simple")).toHaveLength(1);
  expect(serializeRunTranscript(node, [])).not.toContain("mail body");
});
it.each(["letter", "reply", "notify"])("keeps another Agent's %s body for expansion only", mailKind => {
  const [node] = nodes(input(fromAgent("peer", mailKind)), true);
  expect(node).toMatchObject({ text: "mail body", inbound: { kind: mailKind, fromAgentKey: "peer", child: false } });
  expect(serializeRunTranscript(node, [])).not.toContain("mail body");
});
it("shows the parent's task in full inside the child Chat", () => {
  const [node] = nodes(input(fromAgent("bot", "letter")), false);
  expect(node).toMatchObject({ text: "mail body" });
  expect(node.inbound).toBeUndefined();
  expect(serializeRunTranscript(node, [])).toContain("mail body");
});
it("trusts origin.type rather than conflicting mail envelope fields", () => {
  expect(nodes(input({ origin: { type: "agent", agentKey: "peer" }, mailId: "m", mailKind: "reply", mailOrigin: "user" }))[0].inbound).toMatchObject({ kind: "letter", child: false });
  expect(nodes(input({ origin: { type: "user" }, mailId: "m", mailKind: "reply", mailOrigin: "agent" }))[0].inbound).toBeUndefined();
  expect(nodes(input({ origin: { type: "agent", agentKey: "peer" }, mailId: "m", mailKind: "reply", mailOrigin: "agent" }))[0].inbound).toMatchObject({ child: false });
});
