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


jest.mock("./MailAskCard", () => ({ MailAskCard: () => <section data-mail-card="ask" /> }));

it.each([undefined, "steer"] as const)("keeps interactive mail cards outside the metadata label (%s)", messageVariant => {
  const html = renderToStaticMarkup(<TimelineRow node={{
    id: "ask", kind: "message", role: "user", messageVariant, ts: 100,
    text: "internal forwarding prompt",
    mail: { id: "mail", kind: "ask", fromAgentKey: "worker", fromChatId: "child" },
  }} />);
  expect(html).toContain('data-mail-card="ask"');
  expect(html).not.toContain("internal forwarding prompt");
  if (messageVariant === "steer") {
    expect(html).toMatch(/timeline-command-label[^]*?<\/div><section data-mail-card="ask"/);
  }
});


it.each(["reply", "notify"] as const)("marks a child Chat %s without body, toggle or link", kind => {
  const html = renderToStaticMarkup(
    <TimelineInteractionProvider value={{ openChat: jest.fn(), getChatHref: chat => `/?chatId=${chat.chatId}` }}>
      <TimelineRow agents={[{ key: "bot", name: "Bot" } as never]} node={{
        id: "child", kind: "message", role: "user", ts: 100, text: "",
        inbound: { kind, fromAgentKey: "bot", fromChatId: "worker", child: true },
      }} />
    </TimelineInteractionProvider>,
  );
  expect(html).toContain(`data-inbound="${kind}"`);
  expect(html).not.toContain("timeline-user-bubble");
  expect(html).not.toContain("<button");
  expect(html).not.toContain("<a ");
  expect(html).not.toContain("Bot");
});

it.each(["letter", "reply", "notify"] as const)("collapses another Agent's %s behind a toggle and links the BOT", kind => {
  const html = renderToStaticMarkup(
    <TimelineInteractionProvider value={{ openChat: jest.fn(), getChatHref: chat => `/?chatId=${chat.chatId}` }}>
      <TimelineRow agents={[{ key: "peer", name: "Peer Bot", mode: "BOT", primaryChat: { chatId: "peer-main" } } as never]} node={{
        id: "other", kind: "message", role: "user", ts: 100, text: "internal mail body",
        inbound: { kind, fromAgentKey: "peer", fromChatId: "peer-worker", child: false },
      }} />
    </TimelineInteractionProvider>,
  );
  expect(html).toContain(`data-inbound="${kind}"`);
  expect(html).toContain("Peer Bot");
  expect(html).toContain('href="/?chatId=peer-main"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain("internal mail body");
  expect(html).not.toContain("timeline-user-bubble");
});
