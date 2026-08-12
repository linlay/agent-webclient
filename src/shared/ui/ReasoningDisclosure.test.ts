import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReasoningDisclosure } from "./ReasoningDisclosure";

describe("ReasoningDisclosure", () => {
  it("keeps reasoning collapsed by default", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ReasoningDisclosure,
        { label: "思考过程" },
        "hidden reasoning",
      ),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("hidden reasoning");
  });

  it("renders controlled expanded content", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ReasoningDisclosure,
        { label: "分析问题", expanded: true },
        "visible reasoning",
      ),
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("visible reasoning");
  });

  it("keeps the chevron first by default and can place it after the label", () => {
    const defaultHtml = renderToStaticMarkup(
      React.createElement(
        ReasoningDisclosure,
        { label: "默认位置" },
        "reasoning",
      ),
    );
    const endHtml = renderToStaticMarkup(
      React.createElement(
        ReasoningDisclosure,
        { label: "右侧位置", chevronPosition: "end" },
        "reasoning",
      ),
    );

    expect(defaultHtml.indexOf("›")).toBeLessThan(defaultHtml.indexOf("默认位置"));
    expect(endHtml.indexOf("›")).toBeGreaterThan(endHtml.indexOf("右侧位置"));
  });

  it("supports an expanded outer disclosure with independently collapsed children", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ReasoningDisclosure,
        { label: "已完成 2m54s", expanded: true, chevronPosition: "end" },
        React.createElement(
          ReasoningDisclosure,
          { label: "深度思考", defaultExpanded: false, chevronPosition: "end" },
          "hidden snapshot",
        ),
      ),
    );

    expect(html.match(/aria-expanded="true"/gu)).toHaveLength(1);
    expect(html.match(/aria-expanded="false"/gu)).toHaveLength(1);
    expect(html).toContain("深度思考");
    expect(html).not.toContain("hidden snapshot");
  });
});
