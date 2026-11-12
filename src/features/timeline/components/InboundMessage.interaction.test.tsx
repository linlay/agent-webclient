/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { TimelineRow } from "./TimelineRow";
import { TimelineInteractionProvider } from "./TimelineInteractionContext";

jest.mock("@/features/timeline/components/planning", () => ({ PlanningTimeline: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BODY_TEXT = "分身的回信正文";

function mountInbound(onOpenChat: jest.Mock = jest.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      <TimelineInteractionProvider value={{ openChat: onOpenChat, getChatHref: (chat) => `/?chatId=${chat.chatId}` }}>
        <TimelineRow agents={[{ key: "peer", name: "Peer Bot", mode: "BOT", primaryChat: { chatId: "peer-main" } } as never]} node={{
          id: "mail", kind: "message", role: "user", ts: 100, text: BODY_TEXT,
          inbound: { kind: "letter", fromAgentKey: "peer", fromChatId: "peer-worker", child: false },
        }} />
      </TimelineInteractionProvider>,
    );
  });
  const row = container.querySelector("[data-inbound]") as HTMLElement;
  const line = row.firstElementChild as HTMLElement;
  const toggle = row.querySelector("button[aria-expanded]") as HTMLButtonElement;
  const sender = row.querySelector("a") as HTMLAnchorElement;
  return {
    root, container, row, line, toggle, sender,
    expanded: () => container.textContent?.includes(BODY_TEXT) === true,
    unmount: () => { act(() => root.unmount()); container.remove(); },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

it("toggles the body when the line itself is clicked", () => {
  const view = mountInbound();
  expect(view.expanded()).toBe(false);
  act(() => { Simulate.click(view.line, { button: 0 }); });
  expect(view.expanded()).toBe(true);
  expect(view.toggle.getAttribute("aria-expanded")).toBe("true");
  act(() => { Simulate.click(view.line, { button: 0 }); });
  expect(view.expanded()).toBe(false);
  view.unmount();
});

it("toggles from the MaterialIcon button without double-toggling through the line", () => {
  const view = mountInbound();
  act(() => { Simulate.click(view.toggle, { button: 0 }); });
  expect(view.expanded()).toBe(true);
  act(() => { Simulate.click(view.toggle, { button: 0 }); });
  expect(view.expanded()).toBe(false);
  view.unmount();
});

it("keeps the sender link working instead of expanding the body", () => {
  const onOpenChat = jest.fn();
  const view = mountInbound(onOpenChat);
  act(() => { Simulate.click(view.sender, { button: 0 }); });
  expect(onOpenChat).toHaveBeenCalledTimes(1);
  expect(onOpenChat.mock.calls[0][0]).toEqual({ chatId: "peer-main", agentKey: "peer" });
  expect(view.expanded()).toBe(false);
  view.unmount();
});