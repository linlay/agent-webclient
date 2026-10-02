import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelineInteractionProvider } from "./TimelineInteractionContext";
import { WaitCard, waitRemainingSeconds } from "./WaitCard";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";

const TOOL_DEFINITION_TEXT = "Wait within the current Run until a required time limit";
const liveNode: TimelineNode = {
  id: "w", kind: "tool", ts: 100, runId: "r", toolId: "w", toolName: "wait", status: "running",
  description: TOOL_DEFINITION_TEXT,
  toolWait: { startedAt: 100, deadlineAt: 60100, description: "deployment", match: "any", conditions: [] },
};
const ended = (reason: string | null, extra: Partial<TimelineNode> = {}, continued = false): TimelineNode => ({
  id: "w", kind: "tool", ts: 100, runId: "r", toolId: "w", toolName: "wait", status: reason === "failed" ? "failed" : "success",
  description: TOOL_DEFINITION_TEXT, argsText: JSON.stringify({ offset: "+1m", description: "等待部署完成" }),
  result: { text: JSON.stringify(reason ? { reason, ...(continued ? { continued } : {}) } : {}), isCode: true }, ...extra,
});
const render = (node: TimelineNode, active = true, readOnly = false) => renderToStaticMarkup(
  <TimelineInteractionProvider value={{ continueWait: async () => true, readOnly }}>
    <WaitCard node={node} now={100} active={active} />
  </TimelineInteractionProvider>
);

it("uses an absolute deadline and never counts below zero", () => {
  expect(waitRemainingSeconds(10000, 9001)).toBe(1);
  expect(waitRemainingSeconds(10000, 12000)).toBe(0);
});

it("shows a timer only while live and no action without an interaction provider", () => {
  const bare = (active: boolean) => renderToStaticMarkup(<WaitCard node={liveNode} now={100} active={active} />);
  expect(bare(true)).toContain('role="timer"');
  expect(bare(true)).not.toContain("<button");
  expect(bare(false)).not.toContain('role="timer"');
});

it("offers continue only for an interactive, active, root-Run wait", () => {
  expect(render(liveNode)).toContain("<button");
  expect(render(liveNode, false)).not.toContain("<button");
  expect(render(liveNode, true, true)).not.toContain("<button");
  expect(render({ ...liveNode, taskId: "task_1" })).not.toContain("<button");
});

it("shows only this invocation's description, never the tool definition text", () => {
  expect(render(liveNode)).toContain("deployment");
  expect(render(liveNode)).not.toContain(TOOL_DEFINITION_TEXT);
  const replayed = render(ended("elapsed"), false);
  expect(replayed).toContain("等待部署完成");
  expect(replayed).not.toContain(TOOL_DEFINITION_TEXT);
  const withoutDescription = render(ended("elapsed", { argsText: JSON.stringify({ offset: "+1m" }) }), false);
  expect(withoutDescription).not.toContain(TOOL_DEFINITION_TEXT);
  expect(withoutDescription).not.toContain("offset");
});

it("names the end reason and drops the timer and action once a result exists", () => {
  const states: Array<[TimelineNode, string]> = [
    [ended("elapsed"), "elapsed"], [ended("event"), "event"], [ended("timeout"), "timeout"],
    [ended("steered"), "steered"], [ended("steered", {}, true), "continued"],
    [ended("canceled"), "canceled"], [ended("failed"), "failed"], [ended(null), "finished"],
  ];
  for (const [node, state] of states) {
    const html = render(node);
    expect(html).toContain(`data-wait-state="${state}"`);
    expect(html).not.toContain('role="timer"');
    expect(html).not.toContain("<button");
  }
});
