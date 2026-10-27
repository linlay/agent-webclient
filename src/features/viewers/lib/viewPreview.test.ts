import { resolveViewPreview, viewPreviewKey, validViewPreviewAddress } from "./viewPreview";
import { buildChatReplayProjection } from "@/features/conversation/lib/chatReplayProjection";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
const view = { source: "connector" as const, connectorId: "crm", key: "orders", hash: "a".repeat(64) };
const address = { chatId: "chat", runId: "run", sourceId: "content-id", viewIndex: "0" };
const text = '```view key=crm/orders\n{"limit":5}\n```\n```view key=crm/orders\n{"limit":10}\n```';

test("replay restores a bound block by protocol source identity, independent of render counters", () => {
  const replay = buildChatReplayProjection("chat", { events: [{ type: "run.start", runId: "run", timestamp: 1700000000000 }, { type: "content.snapshot", runId: "run", contentId: "content-id", timestamp: 1700000000000, text,
    views: [{ index: 0, view }, { index: 1, view }] }] });
  expect(resolveViewPreview(replay.state.timelineNodes, address)).toMatchObject({ view, payloadRaw: '{"limit":5}' });
  expect(resolveViewPreview(replay.state.timelineNodes, { ...address, viewIndex: "1" })).toMatchObject({ payloadRaw: '{"limit":10}' });
  expect(viewPreviewKey(address)).not.toBe(viewPreviewKey({ ...address, viewIndex: "1" }));
  expect(resolveViewPreview(replay.state.timelineNodes, { ...address, runId: "other" })).toBeNull();
  expect(resolveViewPreview(replay.state.timelineNodes, { ...address, sourceId: "other" })).toBeNull();
});

test("unbound Markdown, invalid index and unrelated tool Chat cannot select templates", () => {
  const node: TimelineNode = { id: "render-counter-99", contentId: "content-id", kind: "content", ts: 1, runId: "run", text };
  expect(resolveViewPreview(new Map([[node.id, node]]), address)).toBeNull();
  expect(validViewPreviewAddress({ ...address, viewIndex: "01" })).toBe(false);
  const tool: TimelineNode = { id: "render-tool", toolId: "tool-id", runId: "run", ts: 1, kind: "tool", view, viewChatId: "other", result: { text: '{"ok":true}', isCode: true } };
  const nodes = new Map([[tool.id, tool]]);
  expect(resolveViewPreview(nodes, { ...address, sourceId: "tool-id", viewIndex: "tool" })).toBeNull();
  tool.viewChatId = "chat";
  expect(resolveViewPreview(nodes, { ...address, sourceId: "tool-id", viewIndex: "tool" })).toMatchObject({ view, payloadRaw: '{"ok":true}' });
});
