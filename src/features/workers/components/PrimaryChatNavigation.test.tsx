/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createInitialState } from "@/app/state/state";
import { I18nProvider } from "@/shared/i18n";
import { PrimaryChatNavigation } from "./PrimaryChatNavigation";
import { PinnedChatSection } from "./PinnedChatSection";

const mockState = createInitialState();
jest.mock("@/app/state/AppContext", () => ({ useAppContext: () => ({ state: mockState }) }));
jest.mock("@/features/chats/components/ChatActionsMenu", () => ({ ChatActionsMenu: ({ renderTrigger }: any) => renderTrigger(jest.fn()) }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => localStorage.clear());

it.each([false, true])("clicking an Agent directly opens its Platform primary chat (collapsed: %s)", async collapsed => {
  mockState.agents = [
    { key: "platform", name: "Platform", mode: "BOT", workspaceDir: "/work/project", primaryChat: { chatId: "primary-chat", lastRunContent: "primary reply" } },
    { key: "empty", name: "Empty", mode: "BOT" },
  ];
  mockState.chats = [{ chatId: "newer-secondary", agentKey: "platform", updatedAt: Date.now(), lastRunContent: "secondary reply" }];
  const onSelectChat = jest.fn();
  const onOpenHistory = jest.fn();
  const onStartPrimary = jest.fn();
  const onClearPrimary = jest.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<I18nProvider locale="zh-CN" persistLocale={false}>
    <PrimaryChatNavigation collapsed={collapsed} onSelectChat={onSelectChat} onStartPrimary={onStartPrimary} onOpenHistory={onOpenHistory} onClearPrimary={onClearPrimary} getChatLoading={() => false} />
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
    expect(host.querySelector('[title="/work/project"]')).not.toBeNull();
    expect(host.textContent).not.toContain("secondary reply");
    expect(host.textContent).not.toContain("新建对话");
    expect(host.textContent).not.toContain("主要对话");
    if (!collapsed) {
      expect(host.textContent).toContain("primary reply");
      await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Platform: 更多操作"]')!.click());
      const history = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent?.includes("显示历史"))!;
      await act(async () => history.click());
      expect(onOpenHistory).toHaveBeenCalledWith("platform");
      await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Platform: 更多操作"]')!.click());
      const clear = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent?.includes("重新开始"))!;
      await act(async () => clear.click());
      expect(onClearPrimary).toHaveBeenCalledWith("platform", "primary-chat");
      expect(onSelectChat).toHaveBeenCalledTimes(1);
    }
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("groups bots, pins Agent identities above the group, and follows primary changes after remount", async () => {
  mockState.agents = [
    { key: "bot", name: "Robot", mode: "BOT", primaryChat: { chatId: "old-primary" } },
    { key: "empty", name: "Empty", mode: "BOT" },
  ];
  mockState.chats = [{ chatId: "ordinary-pin", agentKey: "general", chatName: "Ordinary pin" }];
  mockState.chatPinnedOrder = ["ordinary-pin"];
  const host = document.createElement("div"); document.body.append(host);
  let root = createRoot(host);
  const onSelectChat = jest.fn(); const onStartPrimary = jest.fn();
  const botActions = { onOpenHistory: jest.fn(), onStartPrimary };
  const render = async (collapsed = false) => {
    await act(async () => root.render(<I18nProvider locale="zh-CN" persistLocale={false}>
      <PinnedChatSection collapsed={collapsed} botActions={botActions} onSelectChat={onSelectChat} getChatLoading={() => false} />
      <PrimaryChatNavigation {...botActions} collapsed={collapsed} onSelectChat={onSelectChat} getChatLoading={() => false} />
    </I18nProvider>));
  };
  const pin = async (name: string, label: string) => {
    await act(async () => host.querySelector<HTMLButtonElement>(`button[aria-label="${name}: 更多操作"]`)!.click());
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent?.includes(label))!;
    await act(async () => item.click());
  };
  try {
    await render();
    const heading = host.querySelector<HTMLButtonElement>('nav > div > button[aria-expanded]')!;
    expect(heading.textContent).toContain("机器人");
    await act(async () => heading.click());
    expect(host.querySelector('[aria-label^="Robot,"]')).toBeNull();
    await act(async () => heading.click());
    await pin("Robot", "置顶机器人");
    const pinned = host.querySelector('.pinned-chat-section')!;
    expect(pinned.querySelector('[aria-label^="Robot,"]')).not.toBeNull();
    expect(pinned.textContent).toContain("Ordinary pin");
    expect(pinned.textContent).toContain("(2)");
    expect(host.querySelectorAll('[aria-label^="Robot,"]')).toHaveLength(1);
    expect(pinned.nextElementSibling?.textContent).toContain("机器人");
    expect(pinned.nextElementSibling?.querySelector('[aria-label^="Robot,"]')).toBeNull();
    expect(mockState.chatPinnedOrder).toEqual(["ordinary-pin"]);
    // Pinning an empty bot does not create a Chat.
    await pin("Empty", "置顶机器人");
    expect(onStartPrimary).not.toHaveBeenCalled();
    await act(async () => root.unmount()); root = createRoot(host);
    mockState.agents = mockState.agents.map(agent => agent.key === "bot" ? { ...agent, primaryChat: { chatId: "new-primary" } } : agent);
    await render();
    expect(host.querySelector('.pinned-chat-section')?.textContent).toContain("(3)");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label^="Robot,"]')!.click());
    expect(onSelectChat).toHaveBeenCalledWith("new-primary");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label^="Empty,"]')!.click());
    expect(onStartPrimary).toHaveBeenCalledWith("agent:empty");
    await pin("Robot", "取消置顶机器人");
    expect(host.querySelector('.pinned-chat-section [aria-label^="Robot,"]')).toBeNull();
    expect(host.querySelector('.pinned-chat-section')?.nextElementSibling?.querySelector('[aria-label^="Robot,"]')).not.toBeNull();
    await render(true);
    expect(host.innerHTML.indexOf('aria-label="置顶"')).toBeLessThan(host.innerHTML.indexOf('aria-label="Robot,'));
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="置顶"]')!.click());
    const emptyPin = document.querySelector<HTMLButtonElement>('.ant-popover button[aria-label^="Empty,"]')!;
    expect(emptyPin).not.toBeNull();
    await act(async () => emptyPin.click());
    expect(onStartPrimary).toHaveBeenLastCalledWith("agent:empty");
  } finally { await act(async () => root.unmount()); host.remove(); }
});
