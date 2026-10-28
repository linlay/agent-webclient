import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RunActivityIcon } from "./RunActivityIcon";
import { TimelineRow, TimelineActivityRow } from "./TimelineRow";
import { TimelineInteractionProvider } from "./TimelineInteractionContext";

jest.mock("@/features/timeline/components/planning", () => ({ PlanningTimeline: () => null }));
it("accepts CSS variable colors and independent masks for multiple team icons", () => {
  const html = renderToStaticMarkup(<><RunActivityIcon variant="team" color="var(--accent-electric)" />
    <RunActivityIcon variant="team" color="#e34270" /></>);
  expect(html).toContain("color:var(--accent-electric)");
  expect(html).toContain("color:#e34270");
  const masks = Array.from(html.matchAll(/<mask id="([^"]+)"/g), match => match[1]);
  expect(new Set(masks).size).toBe(2);
  for (const id of masks) expect(html).toContain(`mask="url(#${id})"`);
});
it("passes the conversation appearance to normal activity and leaves retry messages distinct", () => {
  const render = (level: "activity" | "info") => renderToStaticMarkup(
    <TimelineInteractionProvider value={{ activityAppearance: { variant: "knowledge", color: "#36a280" } }}>
      <TimelineRow node={{ id: "progress", kind: "message", role: "system", systemMessageLevel: level,
        text: "正在检索", ts: 1 }} />
    </TimelineInteractionProvider>);
  const activity = render("activity");
  expect(activity).toContain('data-variant="knowledge"');
  expect(activity).toContain("color:#36a280");
  expect(render("info")).not.toContain("data-run-activity-icon");
});
it("renders the empty-run transition through the same activity row", () => {
  const html = renderToStaticMarkup(
    <TimelineInteractionProvider value={{ activityAppearance: { variant: "code", color: "var(--accent-electric)" } }}>
      <TimelineActivityRow text="正在思考…" placeholder />
    </TimelineInteractionProvider>);
  expect(html).toContain('data-kind="activity"');
  expect(html).toContain('data-placeholder="true"');
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain('data-variant="code"');
  expect(html).toContain("正在思考…");
});
