/** @jest-environment jsdom */

import { resolveHtmlVisualizationAssets } from "./htmlVisualizationAssets";

describe("HTML visualization asset resolution", () => {
  it.each([
    "blob:https://webclient.test/preview-id",
    "https://platform.test/api/file?path=report.html",
  ])("loads built-in libraries from WebClient despite an artifact base of %s", (base) => {
    const html = `<!doctype html><html><head>
      <base href="${base}">
      <link rel="stylesheet" href="/assets/visualization/preview.css">
      <script src="/assets/visualization/echarts.min.js"></script>
      <script src="/assets/visualization/mermaid.min.js"></script>
    </head><body><img src="./image.png"><script>const source = "A --> B";</script></body></html>`;
    const output = resolveHtmlVisualizationAssets(html, "https://webclient.test:11948/agent/zenmi");
    const parsed = new DOMParser().parseFromString(output, "text/html");

    expect(parsed.querySelector("base")?.getAttribute("href")).toBe(base);
    expect(Array.from(parsed.querySelectorAll("script[src]"), (node) => node.getAttribute("src"))).toEqual([
      "https://webclient.test:11948/assets/visualization/echarts.min.js",
      "https://webclient.test:11948/assets/visualization/mermaid.min.js",
    ]);
    expect(parsed.querySelector("link")?.getAttribute("href"))
      .toBe("https://webclient.test:11948/assets/visualization/preview.css");
    expect(parsed.querySelector("img")?.getAttribute("src")).toBe("./image.png");
    expect(parsed.querySelector("script:not([src])")?.textContent).toBe('const source = "A --> B";');
  });

  it("preserves unrelated URLs and does not claim to block external libraries", () => {
    const html = '<section><script src="https://cdn.test/mermaid.min.js"></script><link rel="stylesheet" href="/assets/visualization/other.css"></section>';
    expect(resolveHtmlVisualizationAssets(html, "https://webclient.test/"))
      .toBe(html);
  });

  it("preserves ordinary HTML verbatim", () => {
    const html = '<section style="padding:16px"><h3>Summary</h3></section>';
    expect(resolveHtmlVisualizationAssets(html, "https://webclient.test/"))
      .toBe(html);
  });
});
