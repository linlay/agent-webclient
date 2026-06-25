import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownCode } from "./index";
import {
  getMermaidRenderDelay,
  getMermaidRenderConfig,
  getNextMermaidZoom,
  getVisibleMermaidRenderState,
  isMermaidDragDistance,
  MERMAID_ZOOM_DEFAULT,
  MERMAID_ZOOM_MAX,
  MERMAID_ZOOM_MIN,
} from "./MarkdownMermaid";

jest.mock("./index.module.css", () => ({ Collapse: "Collapse" }));

jest.mock("@/app/state/AppContext", () => ({
  useAppDispatch: () => jest.fn(),
}));

jest.mock("antd", () => ({
  App: {
    useApp: () => ({
      message: {
        success: jest.fn(),
      },
    }),
  },
  Collapse: ({
    activeKey,
    items,
  }: {
    activeKey?: string | string[];
    items: Array<{ label: string; children: React.ReactNode }>;
  }) =>
    React.createElement(
      "div",
      {
        className: "ant-collapse",
        "data-active-key": Array.isArray(activeKey)
          ? activeKey.join(",")
          : activeKey || "",
      },
      items.map((item) =>
        React.createElement(
          "section",
          { key: item.label },
          React.createElement("span", null, item.label),
          activeKey === item.label ? item.children : null,
        ),
      ),
    ),
  Flex: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children),
  Tooltip: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

jest.mock("@ant-design/icons", () => ({
  CaretRightOutlined: () => React.createElement("span", null),
}), { virtual: true });

describe("MarkdownCode", () => {
  it("renders Mermaid blocks before the original code block", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MarkdownCode,
        { lang: "mermaid", block: true, streamStatus: "done" },
        "flowchart TD\nA[Start] --> B[Done]",
      ),
    );

    expect(html).toContain("markdown-mermaid");
    expect(html).toContain("mermaid");
  });

  it("keeps Mermaid source collapsed by default while the preview renders", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MarkdownCode,
        { lang: "mermaid", block: true, streamStatus: "loading" },
        "flowchart TD\nA[Start] --> B[Done]",
      ),
    );

    expect(html).toContain("markdown-mermaid");
    expect(html).toContain('data-active-key=""');
    expect(html).not.toContain("flowchart TD");
  });

  it("accepts mermind as a Mermaid language alias", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MarkdownCode,
        { lang: "mermind", block: true, streamStatus: "done" },
        "graph LR\nA --> B",
      ),
    );

    expect(html).toContain("markdown-mermaid");
    expect(html).toContain("mermind");
  });

  it("suppresses Mermaid's built-in error SVG rendering", () => {
    expect(getMermaidRenderConfig("default")).toMatchObject({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      flowchart: {
        htmlLabels: true,
        curve: "basis",
      },
      theme: "default",
    });
  });

  it("keeps interactive Mermaid zoom within readable bounds", () => {
    expect(getNextMermaidZoom(MERMAID_ZOOM_DEFAULT, "in")).toBe(1.25);
    expect(getNextMermaidZoom(1.25, "out")).toBe(MERMAID_ZOOM_DEFAULT);
    expect(getNextMermaidZoom(MERMAID_ZOOM_MAX, "in")).toBe(
      MERMAID_ZOOM_MAX,
    );
    expect(getNextMermaidZoom(MERMAID_ZOOM_MIN, "out")).toBe(
      MERMAID_ZOOM_MIN,
    );
    expect(getNextMermaidZoom(1.75, "reset")).toBe(MERMAID_ZOOM_DEFAULT);
  });

  it("distinguishes Mermaid drag gestures from simple clicks", () => {
    expect(isMermaidDragDistance(0, 0, 2, 2)).toBe(false);
    expect(isMermaidDragDistance(10, 10, 18, 10)).toBe(true);
    expect(isMermaidDragDistance(10, 10, 10, 18)).toBe(true);
  });

  it("debounces Mermaid rendering only while markdown is still streaming", () => {
    expect(getMermaidRenderDelay("loading")).toBeGreaterThanOrEqual(300);
    expect(getMermaidRenderDelay("loading")).toBeLessThanOrEqual(500);
    expect(getMermaidRenderDelay("done")).toBe(0);
    expect(getMermaidRenderDelay(undefined)).toBe(0);
  });

  it("keeps the last successful Mermaid SVG visible during streaming refresh failures", () => {
    expect(
      getVisibleMermaidRenderState(
        { status: "error", message: "Parse failed" },
        { status: "ready", svg: "<svg>previous</svg>" },
        "loading",
      ),
    ).toEqual({ status: "ready", svg: "<svg>previous</svg>", stale: true });

    expect(
      getVisibleMermaidRenderState(
        { status: "error", message: "Parse failed" },
        { status: "ready", svg: "<svg>previous</svg>" },
        "done",
      ),
    ).toEqual({ status: "error", message: "Parse failed" });
  });
});
