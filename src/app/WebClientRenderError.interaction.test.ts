/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { WebClientRenderErrorBoundary, WebClientRenderErrorFallback } from "./WebClientRenderError";
import { copyText } from "@/shared/utils/copy";

jest.mock("@/shared/utils/copy", () => ({ copyText: jest.fn() }));
jest.mock("react-router-dom", () => ({ isRouteErrorResponse: () => false, useRouteError: () => null }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

it("copies the displayed report and keeps it stable across success and failure feedback", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  const root = createRoot(host);
  const logging = jest.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    act(() => root.render(React.createElement(WebClientRenderErrorFallback, { error: new Error("boom"), componentStack: "at BrokenComponent" })));
    const report = host.querySelector("details pre")!.textContent!;
    expect(JSON.parse(report).stack).toContain("at BrokenComponent");
    jest.mocked(copyText).mockResolvedValueOnce(undefined);
    await act(async () => host.querySelector("button")!.click());
    expect(copyText).toHaveBeenLastCalledWith(report);
    expect(host.querySelector('[role="status"]')?.textContent).toBe("renderError.copied");
    jest.mocked(copyText).mockRejectedValueOnce(new Error("clipboard unavailable"));
    await act(async () => host.querySelector("button")!.click());
    expect(host.querySelector('[role="status"]')?.textContent).toBe("renderError.copyFailed");
    expect(host.querySelector("details pre")!.textContent).toBe(report);
    expect(logging).toHaveBeenCalledWith("[webclient-render-error]", report);
  } finally {
    act(() => root.unmount());
    logging.mockRestore();
  }
});

it("includes the component stack when a child crashes and allows retry", () => {
  const rootHost = document.createElement("div");
  const root = createRoot(rootHost);
  const logging = jest.spyOn(console, "error").mockImplementation(() => undefined);
  let broken = true;
  function BrokenComponent() {
    if (broken) throw new Error("render failed");
    return React.createElement("p", null, "recovered");
  }
  try {
    act(() => root.render(React.createElement(WebClientRenderErrorBoundary, null, React.createElement(BrokenComponent))));
    expect(JSON.parse(rootHost.querySelector("details pre")!.textContent!).stack).toContain("BrokenComponent");
    broken = false;
    const retry = Array.from(rootHost.querySelectorAll("button")).find((button) => button.textContent === "renderError.retry")!;
    act(() => retry.click());
    expect(rootHost.textContent).toBe("recovered");
  } finally {
    act(() => root.unmount());
    logging.mockRestore();
  }
});
