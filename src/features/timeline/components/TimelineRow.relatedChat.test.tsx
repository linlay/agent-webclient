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


it.each([undefined, "steer"] as const)("keeps interactive mail cards outside the metadata label (%s)", messageVariant => {
  const html = renderToStaticMarkup(<TimelineInteractionProvider value={{ renderMailAsk: () => <section data-mail-card="ask" /> }}><TimelineRow node={{
    id: "ask", kind: "message", role: "user", messageVariant, ts: 100,
    text: "internal forwarding prompt",
    mail: { id: "mail", kind: "ask", fromAgentKey: "worker", fromChatId: "child" },
  }} /></TimelineInteractionProvider>);
  expect(html).toContain('data-mail-card="ask"');
  expect(html).not.toContain("internal forwarding prompt");
  if (messageVariant === "steer") {
    expect(html).toMatch(/timeline-command-label[^]*?<\/div><section data-mail-card="ask"/);
  }
});

it("does not render an actionable mail card in a read-only host", () => {
  const renderMailAsk = jest.fn(() => <button>Approve</button>);
  const html = renderToStaticMarkup(<TimelineInteractionProvider value={{ readOnly: true, renderMailAsk }}>
    <TimelineRow node={{ id: "ask", kind: "message", role: "user", text: "internal prompt",
      mail: { id: "mail", kind: "ask", fromAgentKey: "worker" } }} />
  </TimelineInteractionProvider>);
  expect(renderMailAsk).not.toHaveBeenCalled();
  expect(html).not.toContain("Approve");
});


it.each(["reply", "notify"] as const)("hides an internal child Chat %s completely", kind => {
  const html = renderToStaticMarkup(
    <TimelineInteractionProvider value={{ openChat: jest.fn(), getChatHref: chat => `/?chatId=${chat.chatId}` }}>
      <TimelineRow agents={[{ key: "bot", name: "Bot" } as never]} node={{
        id: "child", kind: "message", role: "user", ts: 100, text: "",
        inbound: { kind, fromAgentKey: "bot", fromChatId: "worker", child: true },
      }} />
    </TimelineInteractionProvider>,
  );
  expect(html).toBe("");
});

it.each(["letter", "reply", "notify"] as const)("collapses another Agent's %s behind a toggle and links the BOT", kind => {
  const html = renderToStaticMarkup(
    <TimelineInteractionProvider value={{ openChat: jest.fn(), getChatHref: chat => `/?chatId=${chat.chatId}` }}>
      <TimelineRow agents={[{ key: "peer", name: "Peer Bot", mode: "BOT", primaryChat: { chatId: "peer-main" } } as never]} node={{
        id: "other", kind: "message", role: "user", ts: 100, text: "internal mail body",
        inbound: { kind, fromAgentKey: "peer", fromChatId: "peer-worker", child: false, outcome: "completed" },
      }} />
    </TimelineInteractionProvider>,
  );
  expect(html).toContain(`data-inbound="${kind}"`);
  expect(html).toContain("Peer Bot");
  expect(html).toContain('href="/?chatId=peer-main"');
  expect(html).toContain('aria-expanded="false"');
  const toggle = html.match(/<button[^>]*aria-expanded="false"[^>]*>([\s\S]*?)<\/button>/);
  expect(toggle).not.toBeNull();
  expect(toggle![0]).toContain("aria-label=");
  // The MaterialIcon chevron is the button; its label comes from aria-label, not text.
  expect(toggle![1]).toContain('data-material-icon="keyboard_arrow_down"');
  expect(toggle![1].replace(/<[^>]+>/g, "")).toBe("");
  expect(html).toContain('data-expandable="true"');
  expect(html).not.toContain("·");
  expect(html).not.toContain("internal mail body");
  expect(html).not.toContain("timeline-user-bubble");
});

it.each(["reply", "notify"] as const)("hides a child %s even when it carries a title, outcome, body and attachment", kind => {
  const html = renderToStaticMarkup(
    <TimelineInteractionProvider value={{}}>
      <TimelineRow agents={[{ key: "bot", name: "文档小助手" } as never]} node={{ id: "reply", kind: "message", role: "user", text: "private reply body",
        relatedChat: { chatId: "child-chat", title: "创建 Bot：文档小助手" },
        attachments: [{ name: "private.txt" }],
        inbound: { kind, fromAgentKey: "bot", fromChatId: "child-chat", child: true, outcome: "completed" },
      }} />
    </TimelineInteractionProvider>,
  );
  expect(html).toBe("");
});

it("shows the sender avatar to the left of the linked name", () => {
  const html = renderToStaticMarkup(
    <TimelineInteractionProvider value={{ openChat: jest.fn(), getChatHref: chat => `/?chatId=${chat.chatId}` }}>
      <TimelineRow agents={[{ key: "peer", name: "Peer Bot", mode: "BOT", icon: { name: "coder" }, primaryChat: { chatId: "peer-main" } } as never]} node={{
        id: "other", kind: "message", role: "user", ts: 100, text: "body",
        inbound: { kind: "letter", fromAgentKey: "peer", fromChatId: "peer-worker", child: false, outcome: "completed" },
      }} />
    </TimelineInteractionProvider>,
  );
  expect(html).toContain('data-agent-avatar=""');
  // The avatar is part of the sender link, left of the name.
  expect(html.indexOf("<a ")).toBeLessThan(html.indexOf("data-agent-avatar"));
  expect(html.indexOf("data-agent-avatar")).toBeLessThan(html.indexOf("Peer Bot</a>"));
  expect(html).toContain('data-agent-icon-name="coder"');
});

it("omits the avatar when the sender is not in the Agent directory", () => {
  const html = renderToStaticMarkup(
    <TimelineInteractionProvider value={{}}>
      <TimelineRow agents={[]} node={{
        id: "other", kind: "message", role: "user", ts: 100, text: "",
        inbound: { kind: "notify", fromAgentKey: "ghost", child: false },
      }} />
    </TimelineInteractionProvider>,
  );
  expect(html).toContain("ghost");
  expect(html).not.toContain("data-agent-avatar");
  // Nothing to expand: no stretched toggle and no clickable line.
  expect(html).not.toContain("data-expandable");
  expect(html).not.toContain("<button");
});
