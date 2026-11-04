import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelineRow } from "./TimelineRow";
import { TimelineAttachmentView } from "./TimelineAttachmentView";
import { TimelineInteractionProvider, type TimelineInteractionValue } from "./TimelineInteractionContext";

jest.mock("@/features/timeline/components/planning", () => ({ PlanningTimeline: () => null }));

it.each([false, true])("uses bolt for user skill attachments with host rendering %s", (hosted) => {
  const interaction: TimelineInteractionValue = hosted ? {
    renderAttachment: (attachment, options) => <TimelineAttachmentView
      attachment={attachment} options={options} surfaceContext={{ chatId: "chat" }}
    />,
  } : {};
  const html = renderToStaticMarkup(
    <TimelineInteractionProvider value={interaction}>
      <TimelineRow node={{
        id: "user", kind: "message", role: "user", ts: 100,
        attachments: [{ id: "skill-creator", name: "技能创建", type: "skill" }],
      }} />
    </TimelineInteractionProvider>,
  );
  expect(html).toContain("timeline-user-attachments");
  expect(html).toContain('data-reference-type="skill"');
  expect(html).toContain('data-material-icon="bolt"');
  expect(html).not.toContain('data-material-icon="build"');
});

it("renders the chat card in the tool row beside its existing timeline marker", () => {
  const html = renderToStaticMarkup(<TimelineRow node={{
    id: "tool", kind: "tool", toolName: "run_query", ts: 100,
    relatedChat: { chatId: "child", title: "讨论方案" },
  }} />);
  expect(html).toContain('data-kind="tool"');
  expect(html).toContain('data-tool-icon="run"');
  expect(html).toContain('timeline-marker');
  expect(html).toContain('timeline-flow-content');
  expect(html).toContain('aria-disabled="true"');
  expect(html).not.toContain('chatId=child');
  expect(html.indexOf('data-tool-icon="run"')).toBeLessThan(html.indexOf('<a '));
  expect(html.match(/<svg/g)).toHaveLength(1);
});
