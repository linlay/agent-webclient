import type { EventProcessorState } from "@/features/events/lib/eventProcessorTypes";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import { processContentEvent } from "@/features/events/lib/processors/eventProcessorContent";

const hash = "a".repeat(64);

function stateWith(node?: TimelineNode): EventProcessorState {
  return {
    getContentNodeId: () => node?.id,
    getReasoningNodeId: () => undefined,
    getToolNodeId: () => undefined,
    getToolState: () => undefined,
    getTimelineNode: (id) => (node && id === node.id ? node : undefined),
    getNodeText: () => node?.text || "",
    nextCounter: () => 1,
    peekCounter: () => 1,
    activeReasoningKey: "",
    chatId: "chat_1",
    runId: "run_1",
    getTaskItem: () => undefined,
    getActiveTaskIds: () => [],
    getPlanId: () => undefined,
  };
}

function lastNode(commands: ReturnType<typeof processContentEvent>): TimelineNode {
  const command = commands.filter((item) => item.cmd === "SET_TIMELINE_NODE").pop();
  if (!command || command.cmd !== "SET_TIMELINE_NODE") throw new Error("no node");
  return command.node;
}

const streaming: TimelineNode = {
  id: "content_1", kind: "content", contentId: "c1", ts: 1,
  text: "```view key=crm/orders\n{}\n```\n",
};

test("content.view adds a binding that later deltas keep", () => {
  const bound = lastNode(processContentEvent({ type: "content.view", contentId: "c1", index: 0,
    view: { source: "connector", connectorId: "crm", key: "orders", hash } } as never, stateWith(streaming)));
  expect(bound.viewBindings).toEqual({ 0: { index: 0, view: { source: "connector", connectorId: "crm", key: "orders", hash } } });
  const next = lastNode(processContentEvent({ type: "content.delta", contentId: "c1", delta: "more" } as never, stateWith(bound)));
  expect(next.viewBindings).toBe(bound.viewBindings);
  const failed = lastNode(processContentEvent({ type: "content.view", contentId: "c1", index: 1, viewError: "view_not_found" } as never, stateWith(next)));
  expect(failed.viewBindings?.[1]).toEqual({ index: 1, viewError: "view_not_found" });
  expect(failed.viewBindings?.[0]).toBeDefined();
});

test("content.snapshot views restore bindings on replay and ignore malformed entries", () => {
  const node = lastNode(processContentEvent({ type: "content.snapshot", contentId: "c1", text: streaming.text,
    views: [
      { index: 0, view: { source: "connector", connectorId: "crm", key: "orders", hash } },
      { index: 1, viewError: "view_data_invalid" },
      { index: -1, viewError: "x" },
      { index: 2, view: { source: "connector", connectorId: "../bad", key: "orders" } },
    ] } as never, stateWith()));
  expect(Object.keys(node.viewBindings || {})).toEqual(["0", "1"]);
  expect(node.status).toBe("completed");
});
