/** @jest-environment jsdom */
import { createRenderDiagnosticReport, installRenderDiagnosticInteractions, recordRenderBreadcrumb } from "./renderDiagnostics";

describe("render diagnostics", () => {
  it("omits query strings and fragments, bounds event history, and freezes snapshots", () => {
    window.history.replaceState({}, "", "/chats/example?token=secret#private");
    for (let i = 0; i < 50; i++) recordRenderBreadcrumb("event", `event.${i}`);
    recordRenderBreadcrumb("event", "event.49");
    const report = createRenderDiagnosticReport("error", "stack");
    expect(report.route).toBe("/chats/example");
    expect(report.breadcrumbs).toHaveLength(40);
    expect(report.breadcrumbs[39].count).toBe(2);
    recordRenderBreadcrumb("event", "event.49");
    expect(report.breadcrumbs[39].count).toBe(2);
    expect(JSON.stringify(report)).not.toContain("secret");
    expect(JSON.stringify(report)).not.toContain("private");
  });

  it("captures interaction types without reading text or input values and cleans up", () => {
    const cleanup = installRenderDiagnosticInteractions();
    const button = document.createElement("button");
    button.textContent = "confidential content";
    document.body.append(button);
    button.click();
    cleanup();
    const report = createRenderDiagnosticReport("error", "stack");
    expect(report.breadcrumbs.at(-1)?.name).toBe("button");
    expect(JSON.stringify(report)).not.toContain("confidential");
    button.click();
    expect(createRenderDiagnosticReport("error", "stack").breadcrumbs).toEqual(report.breadcrumbs);
    button.remove();
  });
});
