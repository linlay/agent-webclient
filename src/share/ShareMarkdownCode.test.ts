import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShareMarkdownCode } from "./ShareMarkdownCode";

describe("ShareMarkdownCode", () => {
  it("renders inline code without waiting for the full block renderer", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareMarkdownCode, { block: false }, "const value = 1"),
    );

    expect(html).toBe("<code>const value = 1</code>");
  });

  it("keeps block source visible while the full renderer is loading", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ShareMarkdownCode,
        { block: true, lang: "echarts" },
        '{"series":[]}',
      ),
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('{&quot;series&quot;:[]}');
  });
});
