import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IndependentSurfaceFrame } from "@/app/pages/surfaces/SurfaceFrame";

describe("IndependentSurfaceFrame", () => {
  it("renders a manual retry action only for recoverable error states", () => {
    const withRetry = renderToStaticMarkup(
      React.createElement(IndependentSurfaceFrame, {
        kind: "overview",
        title: "概览",
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
        title: "概览",
        error: "加载失败",
      }),
    );
    expect(withoutRetry).not.toContain("<button");
  });
});
