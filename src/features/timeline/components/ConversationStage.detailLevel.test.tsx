/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ConversationStage } from "./ConversationStage";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
/** Virtuoso 用极简替身，把档位标记透出到真实节点上供断言。 */
jest.mock("react-virtuoso", () => ({
  Virtuoso: ({ "data-detail-level": detailLevel }: any) =>
    <div data-testid="stage" data-detail-level={detailLevel} />,
}));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("./TimelineRenderEntryView", () => ({ TimelineRenderEntryView: () => null }));
jest.mock("./TimelineRow", () => ({ TimelineRow: () => null }));
jest.mock("./RunTerminalNotice", () => ({ RunTerminalNotice: () => null }));

function renderStage(detailLevel?: "simple" | "detailed"): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<ConversationStage
    items={[]}
    agents={[]}
    expandedRuns={{}}
    onToggleRun={() => undefined}
    expandedTasks={{}}
    onToggleTask={() => undefined}
    detailLevel={detailLevel}
  />));
  const stage = container.querySelector<HTMLElement>('[data-testid="stage"]');
  if (!stage) throw new Error("stage not rendered");
  return stage;
}

describe("ConversationStage detail level marker", () => {
  it("marks a simple chat so icons and the timeline rail stay hidden", () => {
    expect(renderStage("simple").getAttribute("data-detail-level")).toBe("simple");
  });

  it("marks a detailed chat", () => {
    expect(renderStage("detailed").getAttribute("data-detail-level")).toBe("detailed");
  });

  it("omits the marker when the caller does not resolve a level", () => {
    expect(renderStage().hasAttribute("data-detail-level")).toBe(false);
  });
});