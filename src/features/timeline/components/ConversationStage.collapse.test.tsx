/** @jest-environment jsdom */
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConversationStage, type ConversationListItem } from "./ConversationStage";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("react-virtuoso", () => ({
  Virtuoso: ({ data, itemContent }: any) => data.map((item: any, index: number) =>
    <React.Fragment key={item.key}>{itemContent(index, item)}</React.Fragment>),
}));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("./TimelineRenderEntryView", () => ({ TimelineRenderEntryView: () => <div>Run detail</div> }));
jest.mock("./TimelineRow", () => ({ TimelineRow: () => null }));
jest.mock("./RunTerminalNotice", () => ({ RunTerminalNotice: () => null }));

it("opens a completed run on the first click in StrictMode and closes on the next", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const items = [{ kind: "run", key: "run-1", item: {
    kind: "run", key: "run-1", runId: "run-1", completedAt: 2000,
    responseDurationMs: 1000, nodes: [
      { id: "thinking-1", kind: "thinking", text: "Thinking", status: "done" },
      { id: "content-1", kind: "content", text: "Answer", status: "done" },
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
    act(() => header().click());
    expect(header().getAttribute("aria-expanded")).toBe("true");
    act(() => header().click());
    expect(header().getAttribute("aria-expanded")).toBe("false");
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
