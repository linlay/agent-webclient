/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ConversationStage } from "./ConversationStage";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
/** Minimal Virtuoso stand-in that surfaces the scroller props we assert on. */
jest.mock("react-virtuoso", () => ({
  Virtuoso: (props: any) => (
    <div
      data-testid="stage"
      data-agent-pointer-surface={props["data-agent-pointer-surface"]}
    />
  ),
}));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("./TimelineRenderEntryView", () => ({ TimelineRenderEntryView: () => null }));
jest.mock("./TimelineRow", () => ({ TimelineRow: () => null }));
jest.mock("./RunTerminalNotice", () => ({ RunTerminalNotice: () => null }));

function renderStage(pointerSurface: boolean): HTMLElement {
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
    pointerSurface={pointerSurface}
  />));
  const stage = container.querySelector<HTMLElement>('[data-testid="stage"]');
  if (!stage) throw new Error("stage not rendered");
  return stage;
}

it("declares the chat stage as the Agent pointer surface", () => {
  expect(renderStage(true).hasAttribute("data-agent-pointer-surface")).toBe(true);
});

it("leaves preview and export stages static by default", () => {
  expect(renderStage(false).hasAttribute("data-agent-pointer-surface")).toBe(false);
});