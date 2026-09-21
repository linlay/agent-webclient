/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { TimelineRow } from "@/features/timeline/components/TimelineRow";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";

// Popover 在 jsdom 里不挂内容，而这里要看的正是弹层里的引用行，所以直接把内容一并渲染。
jest.mock("antd", () => {
  const actual = jest.requireActual("antd");
  const react = jest.requireActual<typeof import("react")>("react");
  return {
    ...actual,
    Popover: ({ children, content }: { children: React.ReactNode; content: React.ReactNode }) =>
      react.createElement("div", null, children, content),
  };
});

jest.mock("@/features/surfaces/openTarget", () => ({ useOpenTarget: () => jest.fn() }));
jest.mock("@/features/timeline/components/planning", () => ({ PlanningTimeline: () => null }));

const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

afterAll(() => {
  delete reactActEnvironment.IS_REACT_ACT_ENVIRONMENT;
});

/** 一条带划词引用的用户消息：引用随消息发出后成为附件，时间线把它还原成引用列表。 */
const userNode: TimelineNode = {
  id: "user-1",
  kind: "message",
  role: "user",
  text: "这段再顺一下",
  ts: 1,
  attachments: [
    {
      id: "selection-1",
      name: "Selected text",
      type: "selection",
      text: "quoted passage",
      annotation: "please simplify",
      annotationIndex: 2,
      meta: { sourceKind: "message" },
    },
  ],
};

it("lists a sent message's quotes without offering the locate action", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(TimelineRow, { node: userNode }));
  });
  try {
    const stack = container.querySelector<HTMLElement>(".timeline-user-stack")!;
    expect(stack).not.toBeNull();
    // 引用行仍列出文本与批注，但不再是"点了跳回原文"的按钮。
    const row = stack.querySelector<HTMLElement>(".selected-text-fragment-row")!;
    expect(row.className).toContain("selected-text-fragment-row-static");
    expect(row.getAttribute("role")).toBeNull();
    expect(row.getAttribute("tabindex")).toBeNull();
    expect(row.getAttribute("title")).toBeNull();
    expect(row.textContent).toContain("quoted passage");
    expect(row.textContent).toContain("please simplify");
  } finally {
    act(() => root.unmount());
  }
});
