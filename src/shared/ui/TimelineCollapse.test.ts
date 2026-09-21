/** @jest-environment jsdom */

import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { TimelineCollapse } from "./TimelineCollapse";

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
});
