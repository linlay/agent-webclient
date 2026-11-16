import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelineRow } from "./TimelineRow";
import {
  TimelineInteractionProvider,
  type TimelineInteractionValue,
} from "./TimelineInteractionContext";

jest.mock("@/features/timeline/components/planning", () => ({
  PlanningTimeline: () => null,
}));

const ASK_MAIL = {
  id: "mail",
  kind: "ask" as const,
  fromAgentKey: "worker",
  fromChatId: "child",
};

const interaction: TimelineInteractionValue = {
  renderMailAsk: () => <section data-mail-card="ask" />,
};

const metaRow = <div className="timeline-meta-row" data-testid="meta" />;

function renderRow(
  node: Parameters<typeof TimelineRow>[0]["node"],
  metaNode?: React.ReactNode,
  showTime = false,
) {
  return renderToStaticMarkup(
    <TimelineInteractionProvider value={interaction}>
      <TimelineRow node={node} metaNode={metaNode} showTime={showTime} />
    </TimelineInteractionProvider>,
  );
}

it("drops the meta row on an ask message but keeps the interactive card", () => {
  const html = renderRow(
    { id: "ask", kind: "message", role: "user", ts: 100, text: "内部转交提示", mail: ASK_MAIL },
    metaRow,
  );
  expect(html).toContain('data-mail-card="ask"');
  expect(html).not.toContain("timeline-meta-row");
  expect(html).not.toContain("timeline-row-time");
  // The card header owns the sender line; the row must not duplicate it.
  expect(html).not.toContain('data-mail-kind="ask"');
});

it("left-aligns the ask row instead of the right-aligned user bubble column", () => {
  const html = renderRow(
    { id: "ask", kind: "message", role: "user", ts: 100, text: "内部转交提示", mail: ASK_MAIL },
    metaRow,
  );
  expect(html).toContain("timeline-row-ask");
  expect(html).not.toContain("timeline-row-user");
});

it("keeps an ordinary user message in the right-aligned bubble column", () => {
  const html = renderRow(
    { id: "user", kind: "message", role: "user", ts: 100, text: "你好" },
  );
  expect(html).toContain("timeline-row-user");
  expect(html).not.toContain("timeline-row-ask");
});

it("keeps the meta row on an ordinary user message", () => {
  const html = renderRow(
    { id: "user", kind: "message", role: "user", ts: 100, text: "你好" },
    metaRow,
  );
  expect(html).toContain("timeline-meta-row");
});

it("drops the meta row on an ask steer as well", () => {
  const html = renderRow(
    {
      id: "ask-steer",
      kind: "message",
      role: "user",
      messageVariant: "steer",
      ts: 100,
      text: "内部转交提示",
      mail: ASK_MAIL,
    },
    metaRow,
  );
  expect(html).toContain('data-mail-card="ask"');
  expect(html).not.toContain("timeline-meta-row");
  expect(html).not.toContain("timeline-row-time");
});

it("keeps the timestamp on a non-ask row when there is no meta row", () => {
  const html = renderRow(
    { id: "user", kind: "message", role: "user", ts: Date.now(), text: "你好" },
    undefined,
    true,
  );
  expect(html).toContain("timeline-row-time");
});
