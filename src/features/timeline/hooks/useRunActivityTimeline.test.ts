/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TimelineNode } from "../lib/timelineState";
import { RUN_ACTIVITY_NODE_ID } from "@/shared/ui/modelRetry";
import { useRunActivityTimeline } from "./useRunActivityTimeline";

type Options = Parameters<typeof useRunActivityTimeline>[1];
const activity = (text: string, extra: Partial<TimelineNode> = {}): TimelineNode => ({
  id: RUN_ACTIVITY_NODE_ID, kind: "message", role: "system", systemMessageLevel: "activity",
  runId: "run-a", text, ts: 1, ...extra,
});
const body: TimelineNode = { id: "answer", kind: "content", runId: "run-a", text: "正文", ts: 2 };
let root: Root;
let container: HTMLDivElement;
let displayed: TimelineNode[];
let options: Options;
let nodes: TimelineNode[];
function Harness({ input, config }: { input: TimelineNode[]; config: Options }) {
  displayed = useRunActivityTimeline(input, config);
  return React.createElement("div", null, displayed.map(node =>
    React.createElement("span", { key: node.id, "data-node-id": node.id }, node.text)));
}
function render(input: TimelineNode[], patch: Partial<Options> = {}, strict = false) {
  nodes = input;
  options = { ...options, ...patch };
  act(() => root.render(strict
    ? React.createElement(React.StrictMode, null, React.createElement(Harness, {input, config: options}))
    : React.createElement(Harness, {input, config: options})));
}
function advance(ms: number) { act(() => jest.advanceTimersByTime(ms)); }
function progress() { return displayed.find(node => node.id === RUN_ACTIVITY_NODE_ID)?.text; }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  jest.useFakeTimers().setSystemTime(100_000);
  container = document.createElement("div");
  root = createRoot(container);
  options = {scopeKey: "chat-a/run-a", runId: "run-a", active: true, detailLevel: "summary", events: []};
});
afterEach(() => {
  act(() => root.unmount());
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

it("keeps a slow tool's sentence indefinitely without a timer", () => {
  render([activity("正在读取文件")]);
  advance(30_000);
  expect(progress()).toBe("正在读取文件");
  expect(jest.getTimerCount()).toBe(0);
  render([activity("正在分析结果")]);
  expect(progress()).toBe("正在分析结果");
});
it("holds the current sentence for one second and jumps to the latest pending update", () => {
  render([activity("A")]);
  advance(100); render([activity("B")]);
  advance(400); render([activity("C")]);
  advance(499); expect(progress()).toBe("A");
  expect(jest.getTimerCount()).toBe(1);
  advance(1); expect(progress()).toBe("C");
  advance(100); render([activity("D")]);
  advance(899); expect(progress()).toBe("C");
  advance(1); expect(progress()).toBe("D");
  advance(10_000); expect(progress()).toBe("D");
});
it("does not restart the deadline for duplicate text or newer metadata", () => {
  render([activity("A")]);
  advance(800); render([activity("A", {ts: 999, taskId: "task"})]);
  advance(100); render([activity("B")]);
  advance(99); expect(progress()).toBe("A");
  advance(1); expect(progress()).toBe("B");
});
it("drops a queued update when the latest sentence returns to the visible text", () => {
  render([activity("A")]);
  advance(100); render([activity("B")]);
  advance(300); render([activity("A")]);
  expect(jest.getTimerCount()).toBe(0);
  advance(700); expect(progress()).toBe("A");
  render([activity("C")]); expect(progress()).toBe("C");
});
it.each([{input: []}, {input: [activity("")]}, {input: [activity("   ")]}])("delays clearing absent or empty activity until the deadline", ({input}) => {
  render([activity("A")]);
  advance(200); render(input);
  expect(progress()).toBe("A");
  advance(799); expect(progress()).toBe("A");
  advance(1); expect(progress()).toBeUndefined();
});
it("shows body output immediately while delaying only the activity line's removal", () => {
  const a = activity("A", {taskId: ""});
  const input = [a];
  render(input);
  advance(200); render([a, body]);
  expect(container.textContent).toBe("正文A");
  advance(800);
  expect(displayed).toEqual([body]);
  expect(input).toEqual([a]);
});
it("does not clear progress for output from another task", () => {
  const a = activity("A", {taskId:"task-a"});
  render([a, {...body, taskId:"task-b"}]);
  advance(2000);
  expect(progress()).toBe("A");
});
it("replaces a pending sentence with a clear, then lets the newest activity supersede the clear", () => {
  render([activity("A")]);
  advance(100); render([activity("B")]);
  advance(200); render([]);
  advance(200); render([activity("C")]);
  advance(500); expect(progress()).toBe("C");
  advance(100); render([activity("D")]);
  advance(200); render([]);
  advance(700); expect(progress()).toBeUndefined();
});
it.each(["run.complete", "run.cancel", "run.error"])("clears immediately on %s even if the streaming flag is still true", type => {
  render([activity("A")]);
  advance(100); render([activity("B")]);
  render(nodes, {events:[{type, runId:"run-a",timestamp:100_100}]});
  expect(progress()).toBeUndefined();
  expect(jest.getTimerCount()).toBe(0);
  advance(5000); expect(progress()).toBeUndefined();
});
it("ignores another run's terminal event", () => {
  render([activity("A")], {events:[{type:"run.complete",runId:"old",timestamp:1}]});
  expect(progress()).toBe("A");
});
it("immediately resets on chat/run switches and never resurrects the old pending sentence", () => {
  render([activity("A")]);
  advance(100); render([activity("B")]);
  render([], {scopeKey:"chat-b/run-b",runId:"run-b"});
  expect(progress()).toBeUndefined();
  expect(jest.getTimerCount()).toBe(0);
  render([activity("新进度",{runId:"run-b"})]);
  advance(900); expect(progress()).toBe("新进度");
  render([], {scopeKey:"chat-b/run-c",runId:"run-c"});
  expect(progress()).toBeUndefined();
  advance(5000); expect(progress()).toBeUndefined();
});
it.each([{active:false}, {detailLevel:"full" as const}])("clears immediately when leaving the live summary view", patch => {
  render([activity("A")]);
  advance(100); render([activity("B")]);
  render(nodes, patch);
  expect(progress()).toBeUndefined();
  expect(jest.getTimerCount()).toBe(0);
});
it("cancels the only pending timer on unmount", () => {
  render([activity("A")]);
  advance(100); render([activity("B")]);
  act(() => root.render(null));
  expect(jest.getTimerCount()).toBe(0);
  advance(5000);
  expect(container.textContent).toBe("");
});
it("preserves the dwell deadline during StrictMode effect replay", () => {
  render([activity("A")], {}, true);
  advance(100); render([activity("B")], {}, true);
  advance(899); expect(progress()).toBe("A");
  advance(1); expect(progress()).toBe("B");
});

it("shows the progress line at the none level too", () => {
  options = {...options, detailLevel: "none"};
  render([activity("接下来检查配置加载顺序")]);
  expect(progress()).toBe("接下来检查配置加载顺序");
});
