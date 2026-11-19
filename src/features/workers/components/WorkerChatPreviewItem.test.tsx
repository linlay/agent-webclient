/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createInitialState } from "@/app/state/state";
import { I18nProvider } from "@/shared/i18n";
import type { WorkerConversationRow } from "../lib/workerState";
import { WorkerChatPreviewItem } from "./WorkerChatPreviewItem";

const mockState = createInitialState();
jest.mock("@/app/state/AppContext", () => ({ useAppContext: () => ({ state: mockState }) }));
jest.mock("@/features/chats/components/ChatActionsMenu", () => ({
  ChatActionsMenu: ({ renderTrigger }: any) => renderTrigger(jest.fn()),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const chatRow = (overrides: Partial<WorkerConversationRow> = {}): WorkerConversationRow => ({
  chatId: "chat-1",
  chatName: "running chat",
  updatedAt: 0,
  lastRunId: "run-1",
  lastRunContent: "",
  isRead: true,
  ...overrides,
});

async function renderItem(chat: WorkerConversationRow, loading: boolean, pinnedLayout = false) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(
    <I18nProvider locale="zh-CN" persistLocale={false}>
      <WorkerChatPreviewItem
        chat={chat}
        isActive={false}
        loading={loading}
        pinnedLayout={pinnedLayout}
        onClick={jest.fn()}
      />
    </I18nProvider>,
  ));
  return {
    host,
    cleanup: async () => { await act(async () => root.unmount()); host.remove(); },
  };
}

type View = Awaited<ReturnType<typeof renderItem>>;

const rowOf = (view: View) => view.host.querySelector<HTMLElement>(".worker-chat-item")!;
const spinnerOf = (view: View) => view.host.querySelector<HTMLElement>(".worker-chat-loading");

it.each([false, true])("pins the running spinner to the actions slot instead of the inline status (pinned: %s)", async (pinnedLayout) => {
  const view = await renderItem(chatRow({ isRead: false }), true, pinnedLayout);
  try {
    const row = rowOf(view);
    const spinner = spinnerOf(view)!;
    const slot = spinner.parentElement!;
    // The slot keeps the row's stable right edge: the actions button follows it directly.
    expect(slot.parentElement).toBe(row);
    expect(slot.nextElementSibling).toBe(row.lastElementChild);
    expect(row.lastElementChild?.getAttribute("aria-label")).toBeTruthy();
    expect(row.getAttribute("data-loading")).toBe("true");
    // Loading still outranks unread, so the dot does not also render.
    expect(view.host.querySelector(".chat-unread-dot")).toBeNull();
  } finally { await view.cleanup(); }
});

it("keeps the unread dot when the chat is not loading", async () => {
  const view = await renderItem(chatRow({ isRead: false }), false);
  try {
    expect(spinnerOf(view)).toBeNull();
    expect(rowOf(view).getAttribute("data-loading")).toBeNull();
    expect(view.host.querySelector(".chat-unread-dot")).not.toBeNull();
  } finally { await view.cleanup(); }
});

it("keeps awaiting ahead of loading", async () => {
  const view = await renderItem(chatRow({ hasPendingAwaiting: true, awaitingMode: "question" }), true);
  try {
    expect(spinnerOf(view)).toBeNull();
    expect(rowOf(view).getAttribute("data-loading")).toBeNull();
    expect(view.host.querySelector(".chat-awaiting-status")).not.toBeNull();
  } finally { await view.cleanup(); }
});
