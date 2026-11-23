/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { PlanningTimeline } from "./index";
import { LOCAL_LAYOUT_TOGGLE_EVENT } from "@/shared/utils/localLayoutToggle";

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock("../ContentBlock", () => ({
  ContentBlock: () => React.createElement("div", null, "plan body"),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function mountPlanning() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      React.createElement(PlanningTimeline, {
        node: {
          id: "plan-1",
          kind: "planning",
          role: "assistant",
          text: "1. 第一步",
          status: "completed",
          ts: 1,
        } as never,
      }),
    );
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

it("reports the planning collapse so the timeline keeps its position", () => {
  const listener = jest.fn();
  window.addEventListener(LOCAL_LAYOUT_TOGGLE_EVENT, listener);
  const view = mountPlanning();
  try {
    const header = view.container.querySelector<HTMLElement>(".ant-collapse-header");
    expect(header).not.toBeNull();
    act(() => header?.click());
    expect(listener).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener(LOCAL_LAYOUT_TOGGLE_EVENT, listener);
    view.unmount();
  }
});

it("reports the in-place plan body expansion", () => {
  const listener = jest.fn();
  window.addEventListener(LOCAL_LAYOUT_TOGGLE_EVENT, listener);
  const view = mountPlanning();
  try {
    const expand = Array.from(view.container.querySelectorAll("button")).find(
      (button) => button.textContent === "planningTimeline.expand",
    );
    expect(expand).not.toBeUndefined();
    act(() => expand?.click());
    expect(listener).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).not.toContain("planningTimeline.expand");
  } finally {
    window.removeEventListener(LOCAL_LAYOUT_TOGGLE_EVENT, listener);
    view.unmount();
  }
});
