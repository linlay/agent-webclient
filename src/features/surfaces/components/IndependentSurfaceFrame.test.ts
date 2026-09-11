import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IndependentSurfaceFrame } from "@/features/surfaces/components/IndependentSurfaceFrame";

describe("IndependentSurfaceFrame", () => {
  it("renders a manual retry action only for recoverable error states", () => {
    const withRetry = renderToStaticMarkup(
      React.createElement(IndependentSurfaceFrame, {
        kind: "overview",
        error: "实时视图回放已过期，请重试。",
        onRetry: () => undefined,
      }),
    );
    expect(withRetry).toContain('role="alert"');
    expect(withRetry).toContain("实时视图回放已过期，请重试。");
    expect(withRetry).toMatch(/<button type="button">(?:重试|Retry)<\/button>/);

    const withoutRetry = renderToStaticMarkup(
      React.createElement(IndependentSurfaceFrame, {
        kind: "overview",
        error: "加载失败",
      }),
    );
    expect(withoutRetry).not.toContain("<button");
  });

  it("can render edge-to-edge viewer content", () => {
    const html = renderToStaticMarkup(
      React.createElement(IndependentSurfaceFrame, {
        kind: "resource",
        flushContent: true,
        children: React.createElement("iframe", { title: "artifact" }),
      }),
    );

    expect(html).toContain('class="readonly-run-surface-content is-flush"');
  });
});
