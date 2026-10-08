import { buildHighlightedHtml } from "./useHighlight";

describe("buildHighlightedHtml", () => {
  it("highlights echart and echarts blocks as JSON", () => {
    const code = '{"series":[{"type":"bar","data":[1,2]}]}';
    const expected = buildHighlightedHtml(code, "json");
    expect(buildHighlightedHtml(code, "echart")).toBe(expected);
    expect(buildHighlightedHtml(code, "ECharts")).toBe(expected);
  });

  it("escapes unknown languages as plain text", () => {
    expect(buildHighlightedHtml('graph TD; a --> b', "mermaid")).toBe(
      "graph TD; a --&gt; b",
    );
  });

  it("keeps empty or missing language as plain text", () => {
    expect(buildHighlightedHtml("<div>", "")).toBe("&lt;div&gt;");
    expect(buildHighlightedHtml("<div>", "  ")).toBe("&lt;div&gt;");
  });

  it("still highlights registered languages", () => {
    expect(buildHighlightedHtml("const a = 1", "ts")).toContain(
      'class="hljs-keyword"',
    );
  });
});
