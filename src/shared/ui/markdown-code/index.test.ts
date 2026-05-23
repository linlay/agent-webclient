import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownCode } from "./index";
import { getMermaidRenderConfig } from "./MarkdownMermaid";

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
  Collapse: ({ items }: { items: Array<{ label: string; children: React.ReactNode }> }) =>
    React.createElement(
      "div",
      { className: "ant-collapse" },
      items.map((item) =>
        React.createElement(
          "section",
          { key: item.label },
          React.createElement("span", null, item.label),
          item.children,
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
}));

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
    expect(html).toContain("flowchart TD");
    expect(html).toContain("mermaid");
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
});
