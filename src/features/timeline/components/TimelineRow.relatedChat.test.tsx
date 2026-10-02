import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelineRow } from "./TimelineRow";

jest.mock("@/features/timeline/components/planning", () => ({ PlanningTimeline: () => null }));

it("renders the chat card in the tool row beside its existing timeline marker", () => {
  const html = renderToStaticMarkup(<TimelineRow node={{
    id: "tool", kind: "tool", toolName: "run_query", ts: 100,
    relatedChat: { chatId: "child", title: "讨论方案" },
  }} />);
  expect(html).toContain('data-kind="tool"');
  expect(html).toContain('data-tool-icon="run"');
  expect(html).toContain('timeline-marker');
  expect(html).toContain('timeline-flow-content');
  expect(html).toContain('chatId=child');
  expect(html.indexOf('data-tool-icon="run"')).toBeLessThan(html.indexOf('chatId=child'));
  expect(html.match(/<svg/g)).toHaveLength(1);
});
