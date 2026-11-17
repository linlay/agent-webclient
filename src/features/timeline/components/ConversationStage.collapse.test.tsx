/** @jest-environment jsdom */
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConversationStage, type ConversationListItem } from "./ConversationStage";
import type { TimelineNode } from "../lib/timelineState";
import type { TimelineRenderEntry } from "../lib/timelineDisplay";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("react-virtuoso", () => ({
  Virtuoso: ({ data, itemContent }: any) => data.map((item: any, index: number) =>
    <React.Fragment key={item.key}>{itemContent(index, item)}</React.Fragment>),
}));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("./TimelineRenderEntryView", () => {
  const Entry = ({ entry }: { entry: TimelineRenderEntry }) => entry.kind === "task-group"
    ? <section data-task-group={entry.taskId}>{entry.renderEntries.map(child => <Entry key={child.key} entry={child} />)}</section>
    : <>{(entry.kind === "node" ? [entry.node] : entry.nodes).map(node => <div key={node.id} data-node-id={node.id}>{node.text}</div>)}</>;
  return { TimelineRenderEntryView: Entry };
});
jest.mock("./TimelineRow", () => ({ TimelineRow: () => null }));
jest.mock("./RunTerminalNotice", () => ({ RunTerminalNotice: () => null }));

it("folds share interactions together and keeps the final answer and terminal error visible", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const nodes: TimelineNode[] = [
    { id: "process-one", kind: "thinking", text: "Thinking" },
    { id: "image", kind: "tool", toolName: "image_generate", status: "success" },
    { id: "approval", kind: "awaiting-answer", text: "Approved", taskId: "child" },
    { id: "process-two", kind: "thinking", text: "Thinking again", taskId: "child" },
    { id: "task-image", kind: "tool", toolName: "image_generate", status: "success", taskId: "child" },
    { id: "task-after-image", kind: "tool", toolName: "file_read", taskId: "child" },
    { id: "steer", kind: "message", role: "user", text: "More input" },
    { id: "timeout", kind: "awaiting-answer", text: "Timed out" },
    { id: "partial", kind: "content", text: "Partial answer" },
    { id: "error", kind: "message", role: "system", systemMessageLevel: "error", text: "Run failed" },
  ];
  const items = [{ kind: "run", key: "run", item: {
    kind: "run", key: "run", completedAt: 2000, responseDurationMs: 1000, nodes, renderEntries: [],
  } }] as unknown as ConversationListItem[];
  function Harness() {
    const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({});
    return <ConversationStage items={items} agents={[]} viewport={{ mode: "document" }} expandedRuns={expandedRuns}
      onToggleRun={key => setExpandedRuns(current => ({ ...current, [key]: !current[key] }))}
      expandedTasks={{}} onToggleTask={() => undefined} />;
  }
  try {
    act(() => root.render(<Harness />));
    const visibleIds = () => Array.from(container.querySelectorAll("[data-node-id]"), node => node.getAttribute("data-node-id"));
    expect(visibleIds()).toEqual(["image", "task-image", "partial", "error"]);
    const headers = container.querySelectorAll<HTMLElement>(".ant-collapse-header");
    expect(Array.from(headers, header => header.textContent)).toEqual(["timeline.run.processed"]);
    const answer = container.querySelector('[data-node-id="partial"]');
    act(() => headers[0].click());
    expect(visibleIds()).toEqual([
      "process-one", "image", "approval", "process-two", "task-image", "task-after-image", "steer", "timeout", "partial", "error",
    ]);
    expect(container.querySelectorAll('[data-task-group="child"]')).toHaveLength(1);
    for (const id of ["partial", "error"]) {
      expect(container.querySelector(`[data-node-id="${id}"]`)!.closest(".timeline-run-collapse")).toBeNull();
    }
    act(() => headers[0].click());
    expect(visibleIds()).toEqual(["image", "task-image", "partial", "error"]);
    expect(container.querySelector('[data-node-id="partial"]')).toBe(answer);
  } finally { act(() => root.unmount()); container.remove(); }
});

it.each<{ name: string; lastNode: TimelineNode; visible: boolean }>([
  { name: "final content", lastNode: { id: "last", kind: "content", text: "Answer", status: "done" }, visible: true },
  { name: "final system error", lastNode: { id: "last", kind: "message", role: "system", systemMessageLevel: "error", text: "Rate limited" }, visible: true },
  { name: "final system info", lastNode: { id: "last", kind: "message", role: "system", systemMessageLevel: "info", text: "Info" }, visible: false },
])("keeps $name in its expected region while toggling a completed run", ({ lastNode, visible }) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const items = [{ kind: "run", key: "run-1", item: {
    kind: "run", key: "run-1", runId: "run-1", completedAt: 2000,
    responseDurationMs: 1000, nodes: [
      { id: "thinking-1", kind: "thinking", text: "Thinking", status: "done" },
      lastNode,
    ], renderEntries: [],
  } }] as unknown as ConversationListItem[];
  function Harness() {
    const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({});
    return <ConversationStage items={items} agents={[]} expandedRuns={expandedRuns}
      onToggleRun={(key) => setExpandedRuns(current => ({ ...current, [key]: !current[key] }))}
      expandedTasks={{}} onToggleTask={() => undefined} />;
  }
  try {
    act(() => root.render(<React.StrictMode><Harness /></React.StrictMode>));
    const header = () => container.querySelector(".ant-collapse-header") as HTMLElement;
    expect(header().getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[data-node-id="last"]') !== null).toBe(visible);
    expect(container.querySelector('[data-node-id="thinking-1"]')).toBeNull();
    act(() => header().click());
    expect(header().getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector('[data-node-id="thinking-1"]')).not.toBeNull();
    if (visible) {
      const finalNodes = container.querySelectorAll('[data-node-id="last"]');
      expect(finalNodes).toHaveLength(1);
      expect(finalNodes[0].closest(".timeline-run-collapse")).toBeNull();
    }
    act(() => header().click());
    expect(header().getAttribute("aria-expanded")).toBe("false");
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it("keeps delegated approvals and parent steers visible outside a completed Run's collapsed process", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const nodes: TimelineNode[] = [
    { id: "thinking", kind: "thinking", text: "Process", status: "done" },
    { id: "parent-steer", kind: "message", role: "user", messageVariant: "steer", text: "Parent instruction" },
    { id: "ask", kind: "message", role: "user", messageVariant: "steer", text: "Approval card",
      mail: { id: "mail", kind: "ask", fromAgentKey: "bot", fromChatId: "child" } },
    { id: "answer", kind: "content", text: "Please approve", status: "done" },
  ];
  const items = [{ kind: "run", key: "run", item: {
    kind: "run", key: "run", completedAt: 2000, nodes, renderEntries: [],
  } }] as unknown as ConversationListItem[];
  try {
    act(() => root.render(<ConversationStage items={items} agents={[]} expandedRuns={{}}
      onToggleRun={() => undefined} expandedTasks={{}} onToggleTask={() => undefined} />));
    expect(container.querySelector('[data-node-id="thinking"]')).toBeNull();
    for (const id of ["parent-steer", "ask", "answer"]) {
      const node = container.querySelector(`[data-node-id="${id}"]`);
      expect(node).not.toBeNull();
      expect(node!.closest(".timeline-run-collapse")).toBeNull();
    }
  } finally { act(() => root.unmount()); container.remove(); }
});
