import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Agent } from "@/features/agents/lib/agentState";
import { MailBadge } from "./MailBadge";

const MAIL = {
  id: "mail",
  kind: "ask" as const,
  fromAgentKey: "worker",
  fromAgentName: "Worker",
  fromChatId: "child",
};

const WORKER = {
  key: "worker",
  name: "Worker",
  mode: "GENERAL",
  icon: { name: "general" },
} as unknown as Agent;

it("puts the sender avatar before the name", () => {
  const html = renderToStaticMarkup(
    <MailBadge
      mail={MAIL}
      href="/agent/worker?chatId=child"
      agents={[WORKER]}
    />,
  );
  expect(html).toContain("data-agent-avatar");
  // Default interactivity: the avatar may follow the pointer like other agent icons.
  expect(html).not.toContain("data-agent-pointer-disabled");
  expect(html.indexOf("data-agent-avatar")).toBeLessThan(
    html.indexOf("Worker"),
  );
  // The avatar shares the sender link so identity and target read as one unit.
  expect(html).toContain('href="/agent/worker?chatId=child"');
  // Identity first, then the kind: the name never sits inside the wording.
  expect(html).toContain("Worker</a> · 请示");
});

it("stays text-only when the sender is not in the directory", () => {
  const html = renderToStaticMarkup(<MailBadge mail={MAIL} agents={[]} />);
  expect(html).not.toContain("data-agent-avatar");
  expect(html).toContain("Worker");
});

it("renders the avatar without a link when no Chat target is known", () => {
  const html = renderToStaticMarkup(
    <MailBadge
      mail={{ ...MAIL, fromChatId: "" }}
      agents={[WORKER]}
    />,
  );
  expect(html).toContain("data-agent-avatar");
  // Default interactivity: the avatar may follow the pointer like other agent icons.
  expect(html).not.toContain("data-agent-pointer-disabled");
  expect(html).not.toContain("<a ");
});

it("appends the outcome after the kind, never between sender and kind", () => {
  const html = renderToStaticMarkup(
    <MailBadge mail={{ ...MAIL, outcome: "completed" }} agents={[WORKER]} />,
  );
  expect(html).toContain("Worker</a> · 请示 · 完成");
});
