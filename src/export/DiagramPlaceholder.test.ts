import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DiagramLoading } from "./DiagramPlaceholder";
import { StaticECharts } from "./StaticECharts";
import { StaticMermaid } from "./StaticMermaid";

jest.mock("./ConversationExportDocument.module.css", () => ({
  chart: "chart",
  chartFrame: "chart-frame",
  codeBlock: "code-block",
  diagramLoading: "diagram-loading",
  diagramLoadingOverlay: "diagram-loading-overlay",
  diagramLoadingSpinner: "diagram-loading-spinner",
}));

describe("diagram placeholders", () => {
  it("renders a visible and accessible loading status", () => {
    const html = renderToStaticMarkup(React.createElement(DiagramLoading));

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Loading diagram…");
    expect(html).toContain("diagram-loading-spinner");
  });

  it("keeps the ECharts canvas mounted behind its loading overlay", () => {
    const html = renderToStaticMarkup(
      React.createElement(StaticECharts, {
        source: '{"series":[{"type":"bar","data":[1,2]}]}',
      }),
    );

    expect(html).toContain("chart-frame");
    expect(html).toContain('role="img"');
    expect(html).toContain("diagram-loading-overlay");
    expect(html).toContain("Loading diagram…");
  });

  it("shows loading for Mermaid and source fallback for invalid ECharts JSON", () => {
    const mermaid = renderToStaticMarkup(
      React.createElement(StaticMermaid, { source: "flowchart LR\nA --> B" }),
    );
    const invalidECharts = renderToStaticMarkup(
      React.createElement(StaticECharts, { source: "not-json" }),
    );

    expect(mermaid).toContain("Loading diagram…");
    expect(invalidECharts).toContain(
      "echarts · Diagram unavailable; showing source",
    );
    expect(invalidECharts).toContain("not-json");
  });
});
