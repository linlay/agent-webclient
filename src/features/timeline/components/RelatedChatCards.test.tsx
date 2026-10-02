import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RelatedChatCards } from "./RelatedChatCards";
import { TimelineInteractionProvider } from "./TimelineInteractionContext";
import type { TimelineNode } from "../lib/timelineState";

it("deduplicates chats, excludes the current chat and escapes titles and links", () => {
  const nodes: TimelineNode[] = ["child&x", "child&x", "parent", "other"].map((chatId, index) => ({
    id: String(index), kind: "tool", ts: 1, relatedChat: { chatId, title: "<讨论>", agentKey: "coder" },
  }));
  const html = renderToStaticMarkup(<TimelineInteractionProvider value={{ surfaceContext: { chatId: "parent" } }}>
    <RelatedChatCards nodes={nodes} agents={[{ key: "coder", name: "代码助手" }]} />
  </TimelineInteractionProvider>);
  expect(html.match(/<a /g)).toHaveLength(2);
  expect(html).toContain("chatId=child%26x");
  expect(html).toContain("&lt;讨论&gt;");
  expect(html).toContain("代码助手");
  expect(html).not.toContain("chatId=parent");
});
