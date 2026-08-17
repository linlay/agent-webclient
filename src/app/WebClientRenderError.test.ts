import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  resolveWebClientRenderErrorDetails,
  WebClientRenderErrorBoundary,
  WebClientRenderErrorFallback,
} from "@/app/WebClientRenderError";

describe("WebClient render error fallback", () => {
  it("shows a visible error message and recovery actions", () => {
    const html = renderToStaticMarkup(
      React.createElement(WebClientRenderErrorFallback, {
        error: new Error("broken timeline node"),
        onReload: () => undefined,
        onRetry: () => undefined,
      }),
    );

    expect(html).toContain('data-webclient-render-error="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("broken timeline node");
    expect((html.match(/<button/g) || [])).toHaveLength(2);
  });

  it("keeps the normal tree unchanged before an error", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        WebClientRenderErrorBoundary,
        null,
        React.createElement("div", null, "healthy page"),
      ),
    );

    expect(html).toContain("healthy page");
    expect(html).not.toContain("data-webclient-render-error");
  });

  it("normalizes non-Error values into readable details", () => {
    expect(resolveWebClientRenderErrorDetails({ code: "BAD_NODE" })).toEqual({
      message: '{"code":"BAD_NODE"}',
      stack: "",
    });
  });
});
