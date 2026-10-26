/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createInitialState } from "@/app/state/state";
import { I18nProvider } from "@/shared/i18n";
import { PrimaryChatNavigation } from "./PrimaryChatNavigation";

const mockState = createInitialState();
jest.mock("@/app/state/AppContext", () => ({ useAppContext: () => ({ state: mockState }) }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it.each([false, true])("clicking an Agent directly opens its Platform primary chat (collapsed: %s)", async collapsed => {
  mockState.agents = [
    { key: "platform", name: "Platform", primaryChat: { chatId: "primary-chat", lastRunContent: "primary reply" } },
    { key: "empty", name: "Empty" },
  ];
  mockState.chats = [{ chatId: "newer-secondary", agentKey: "platform", updatedAt: Date.now(), lastRunContent: "secondary reply" }];
  const onSelectChat = jest.fn();
  const onOpenHistory = jest.fn();
  const onStartPrimary = jest.fn();
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<I18nProvider locale="zh-CN" persistLocale={false}>
    <PrimaryChatNavigation collapsed={collapsed} onSelectChat={onSelectChat} onStartPrimary={onStartPrimary} onOpenHistory={onOpenHistory} getChatLoading={() => false} />
  </I18nProvider>));
  try {
    const entry = host.querySelector<HTMLButtonElement>('button[aria-label^="Platform,"]')!;
    await act(async () => entry.click());
    expect(onSelectChat).toHaveBeenCalledWith("primary-chat");
    expect(onSelectChat).toHaveBeenCalledTimes(1);
    expect(onStartPrimary).not.toHaveBeenCalled();
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label^="Empty,"]')!.click());
    expect(onStartPrimary).toHaveBeenCalledWith("agent:empty");
    expect(onSelectChat).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain("secondary reply");
    expect(host.textContent).not.toContain("新建对话");
    if (!collapsed) {
      expect(host.textContent).toContain("primary reply");
      await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Platform: 显示历史"]')!.click());
      expect(onOpenHistory).toHaveBeenCalledWith("platform");
    }
  } finally { await act(async () => root.unmount()); }
});
