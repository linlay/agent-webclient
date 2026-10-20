/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
const { renderToStaticMarkup } = require("react-dom/server.node") as typeof import("react-dom/server");
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
  expect(html).toContain('aria-disabled="true"');
  expect(html).not.toContain("href=");
  expect(html).toContain("&lt;讨论&gt;");
  expect(html).toContain("代码助手");
  expect(html).not.toContain("chatId=parent");
});

// Exercise actual link props: browser modifier/default navigation must remain intact.
it("preserves host links and intercepts only ordinary main-chat clicks", () => {
  const nodes: TimelineNode[] = [{ id:"related", kind:"tool", ts:1, relatedChat:{chatId:"child&x",title:"Child"} }];
  const getChatHref = (chat: {chatId:string}) => `/?${new URLSearchParams({chatId:chat.chatId})}`;
  const html = renderToStaticMarkup(<TimelineInteractionProvider value={{getChatHref}}>
    <RelatedChatCards nodes={nodes} agents={[]} />
  </TimelineInteractionProvider>);
  expect(html).toContain('href="/?chatId=child%26x"');
  expect(html).toContain('aria-disabled="false"');
});

it("leaves modifier clicks to the browser and uses the host for ordinary clicks", () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  const root = createRoot(host);
  const openChat = jest.fn();
  try {
    act(() => root.render(<TimelineInteractionProvider value={{openChat,getChatHref:chat=>`/?chatId=${chat.chatId}`}}>
      <RelatedChatCards nodes={[{id:"t",kind:"tool",ts:1,relatedChat:{chatId:"child"}}]} agents={[]} />
    </TimelineInteractionProvider>));
    const link = host.querySelector("a")!;
    for (const modifiers of [{metaKey:true},{ctrlKey:true},{shiftKey:true},{altKey:true},{button:1}]) {
      const event = new MouseEvent("click",{bubbles:true,cancelable:true,...modifiers});
      act(() => link.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(false);
      expect(openChat).not.toHaveBeenCalled();
    }
    const event = new MouseEvent("click",{bubbles:true,cancelable:true});
    act(() => link.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(openChat).toHaveBeenCalledWith(expect.objectContaining({chatId:"child"}));
  } finally {act(() => root.unmount());}
});
