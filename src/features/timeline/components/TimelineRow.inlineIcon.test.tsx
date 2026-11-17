import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelineRow } from "./TimelineRow";
import { TimelineInteractionProvider } from "./TimelineInteractionContext";
import type { TimelineNode } from "../lib/timelineState";
import type { EventDetailLevel } from "@/shared/data/eventDetailLevel";

/** 行内图标的开关来自交互上下文的 detailLevel，这里锁定它的两种形态。 */
function render(node: TimelineNode, detailLevel?: EventDetailLevel): string {
  return renderToStaticMarkup(
    <TimelineInteractionProvider value={{ detailLevel }}>
      <TimelineRow node={node} />
    </TimelineInteractionProvider>,
  );
}

const thinking: TimelineNode = { id: "t1", kind: "thinking", ts: 1, text: "思考内容" } as TimelineNode;
const steer: TimelineNode = {
  id: "s1",
  kind: "message",
  role: "user",
  messageVariant: "steer",
  ts: 1,
  text: "忽略，这个 message 就是测试",
} as TimelineNode;
const awaiting: TimelineNode = {
  id: "a1",
  kind: "awaiting-answer",
  ts: 1,
  text: "[]",
} as TimelineNode;
const wait: TimelineNode = {
  id: "w1",
  kind: "tool",
  ts: 1,
  runId: "r1",
  toolId: "wait_1",
  toolName: "wait",
  status: "running",
  toolWait: { startedAt: 1, deadlineAt: 61000, description: "等待剩余 4 个重派任务回信", match: "any", conditions: [] },
} as TimelineNode;

describe("TimelineRow icon placement by detail level", () => {
  it("keeps the icon column for detailed rows", () => {
    const html = render(thinking, "detailed");
    expect(html).toContain("timeline-marker");
    expect(html).not.toContain("timeline-inline-icon");
  });

  it("renders the icon inline for simple rows and drops the column", () => {
    const html = render(thinking, "simple");
    expect(html).toContain("timeline-inline-icon");
    expect(html).not.toContain("timeline-marker");
  });

  it("keeps the steer icon on the bubble line", () => {
    const html = render(steer, "simple");
    // 图标与气泡同一行：图标在行内槽位里，不是单独一行。
    expect(html).toContain("timeline-inline-row");
    expect(html).toContain("timeline-inline-icon");
    expect(html).not.toContain("timeline-marker");
    expect(html).toContain("timeline-user-bubble");
  });

  it("centers the wait icon on its card instead of the card's first line", () => {
    const detailed = render(wait, "detailed");
    expect(detailed).toContain("timeline-row-wait");
    expect(detailed).toContain("timeline-marker tw:relative tw:flex tw:self-stretch tw:items-center");
    // simple 档没有图标列，图标在行内随卡片中线居中。
    const simple = render(wait, "simple");
    expect(simple).not.toContain("timeline-marker");
    expect(simple).toContain("timeline-inline-row-center");
  });

  it("puts the inline icon inside a collapse header in simple mode", () => {
    const simple = render(awaiting, "simple");
    const detailed = render(awaiting, "detailed");

    expect(simple).toContain("timeline-label-with-icon");
    expect(simple).toContain("timeline-inline-icon");
    expect(simple).not.toContain("timeline-marker");
    // detailed 仍是列图标 + 纯文案头部。
    expect(detailed).toContain("timeline-marker");
    expect(detailed).not.toContain("timeline-label-with-icon");
  });
});
