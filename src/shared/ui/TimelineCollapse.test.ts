/** @jest-environment jsdom */

import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { TimelineCollapse } from "./TimelineCollapse";
import {
  LOCAL_LAYOUT_TOGGLE_EVENT,
  notifyLocalLayoutToggle,
} from "@/shared/utils/localLayoutToggle";

(globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
}).IS_REACT_ACT_ENVIRONMENT = true;

describe("TimelineCollapse", () => {
  it("opens and closes a controlled non-text node on consecutive clicks", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const Example = () => {
      const [expanded, setExpanded] = useState(false);
      return React.createElement(TimelineCollapse, {
        label: "执行命令",
        expanded,
        onExpand: setExpanded,
        children: React.createElement("pre", null, "工具结果"),
      });
    };

    try {
      act(() => root.render(React.createElement(Example)));
      const header = container.querySelector<HTMLElement>(".ant-collapse-header");
      expect(header?.getAttribute("aria-expanded")).toBe("false");

      act(() => header?.click());
      expect(header?.getAttribute("aria-expanded")).toBe("true");
      expect(container.textContent).toContain("工具结果");

      act(() => header?.click());
      expect(header?.getAttribute("aria-expanded")).toBe("false");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it("reports every expand and collapse so the timeline keeps its position", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const listener = jest.fn();
    window.addEventListener(LOCAL_LAYOUT_TOGGLE_EVENT, listener);
    const Example = () => {
      const [expanded, setExpanded] = useState(false);
      return React.createElement(TimelineCollapse, {
        label: "思考过程",
        expanded,
        onExpand: setExpanded,
        children: React.createElement("pre", null, "推理内容"),
      });
    };

    try {
      act(() => root.render(React.createElement(Example)));
      const header = container.querySelector<HTMLElement>(".ant-collapse-header");
      act(() => header?.click());
      act(() => header?.click());
      expect(listener).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener(LOCAL_LAYOUT_TOGGLE_EVENT, listener);
      act(() => root.unmount());
      container.remove();
    }
  });

  it("passes the layout-change signal through the shared helper", () => {
    const listener = jest.fn();
    window.addEventListener(LOCAL_LAYOUT_TOGGLE_EVENT, listener);
    try {
      notifyLocalLayoutToggle();
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(LOCAL_LAYOUT_TOGGLE_EVENT, listener);
    }
  });
});
