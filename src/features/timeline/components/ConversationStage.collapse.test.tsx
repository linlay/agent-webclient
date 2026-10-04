/** @jest-environment jsdom */
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConversationStage, type ConversationListItem } from "./ConversationStage";
import type { TimelineNode } from "../lib/timelineState";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("react-virtuoso", () => ({
  Virtuoso: ({ data, itemContent }: any) => data.map((item: any, index: number) =>
    <React.Fragment key={item.key}>{itemContent(index, item)}</React.Fragment>),
}));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("./TimelineRenderEntryView", () => ({
  TimelineRenderEntryView: ({ entry }: any) => <div data-node-id={entry.node.id}>{entry.node.text}</div>,
}));
jest.mock("./TimelineRow", () => ({ TimelineRow: () => null }));
jest.mock("./RunTerminalNotice", () => ({ RunTerminalNotice: () => null }));

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
