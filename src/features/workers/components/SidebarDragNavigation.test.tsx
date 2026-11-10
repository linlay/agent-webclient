/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInitialState } from "@/app/state/state";
import { I18nProvider } from "@/shared/i18n";
import { buildWorkerRows } from "../lib/workerListFormatter";
import { SidebarAgentNavigation } from "./SidebarAgentNavigation";
import { PrimaryChatNavigation } from "./PrimaryChatNavigation";

const mockState = createInitialState();
jest.mock("@/app/state/AppContext", () => ({ useAppContext: () => ({ state: mockState }) }));
jest.mock("../hooks/useSidebarChatPreviews", () => ({ useSidebarChatPreviews: () => ({
  fetchedIds: [], limits: {}, pending: {}, moreAvailable: {}, errors: {}, showMore: jest.fn(), retry: jest.fn(),
}) }));
jest.mock("./WorkerActionsMenu", () => ({ WorkerActionsMenu: ({ children }: any) => children }));
jest.mock("@/features/chats/components/ChatActionsMenu", () => ({ ChatActionsMenu: ({ renderTrigger }: any) => renderTrigger(jest.fn()) }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const select = jest.fn();
const noOp = jest.fn();
const render = async () => {
  await act(async () => root.render(<I18nProvider locale="zh-CN" persistLocale={false}>
    <PrimaryChatNavigation onSelectChat={select} onStartPrimary={noOp} onOpenHistory={noOp} getChatLoading={() => false} />
    <SidebarAgentNavigation generalAgentKey="agent:general" onSelectGeneralAgent={noOp} onNewConversation={noOp}
      onNewProject={noOp} creatingProject={false} onSelectChat={select} onOpenHistory={noOp} getChatLoading={() => false}
      chatsByWorker={new Map(mockState.workerRows.map(row => [row.key, mockState.chats.filter(chat => chat.agentKey === row.sourceId).map(chat => ({ ...chat, updatedAt: Number(chat.updatedAt), chatName: chat.chatName || "", lastRunContent: "" }))]))}
      workerActions={{} as any} terminalStatuses={new Map()} excludeAgentKeys={new Set(["bot-a", "bot-b"])} />
  </I18nProvider>));
};

beforeEach(async () => {
  localStorage.clear(); select.mockClear();
  mockState.accessToken = "identity-a";
  mockState.agents = [
    { key: "general", name: "General", mode: "GENERAL" },
    { key: "project-a", name: "Project A", mode: "CODER", workspaceDir: "/a" },
    { key: "project-b", name: "Project B", mode: "CODER", workspaceDir: "/b" },
    { key: "bot-a", name: "Bot A", mode: "BOT", primaryChat: { chatId: "bot-chat-a" } },
    { key: "bot-b", name: "Bot B", mode: "BOT", primaryChat: { chatId: "bot-chat-b" } },
  ];
  mockState.chats = ["general", "project-a", "project-b"].flatMap(agentKey => [0, 1].map(i => ({
    chatId: `${agentKey}-${i}`, chatName: `${agentKey}-${i}`, agentKey, updatedAt: 1710000000000 - i,
  })));
  mockState.workerSelectionKey = "agent:project-a";
  mockState.workerRows = buildWorkerRows({ agents: mockState.agents, chats: mockState.chats });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await render();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

function row(label: string): HTMLElement {
  return host.querySelector<HTMLElement>(`[aria-label="${label}"], [aria-label^="${label},"]`)!.closest<HTMLElement>('[draggable="true"]')!;
}
function chat(id: string): HTMLElement {
  return [...host.querySelectorAll<HTMLElement>('.worker-chat-item')].find(item => item.textContent?.includes(id))!;
}
function dragEvent(element: HTMLElement, type: string, after = false) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: { setData: jest.fn(), setDragImage: jest.fn() } },
    clientY: { value: after ? 1 : -1 },
  });
  element.dispatchEvent(event);
}
async function drag(from: HTMLElement, to: HTMLElement, after = false) {
  expect(from.draggable).toBe(true); expect(to.draggable).toBe(true);
  await act(async () => dragEvent(from, "dragstart"));
  await act(async () => dragEvent(to, "dragover", after));
  await act(async () => dragEvent(to, "drop", after));
  await act(async () => dragEvent(from, "dragend"));
}
const chatIds = (section: Element) => [...section.querySelectorAll('.worker-chat-item')].map(item => item.textContent?.match(/(?:general|project-[ab])-\d/)?.[0]);

it("directly drags projects, project chats, general chats and bots, retaining all orders after remount", async () => {
  await drag(row("Project B"), row("Project A"));
  expect([...host.querySelectorAll('[aria-label^="Project "]')].map(item => item.getAttribute("aria-label"))).toEqual(["Project B", "Project A"]);
  await drag(chat("project-a-1"), chat("project-a-0"));
  await act(async () => {
    const project = host.querySelector<HTMLElement>('[aria-label="Project B"]')!;
    project.dispatchEvent(new Event("pointerdown", { bubbles: true })); project.click();
  });
  expect(chatIds(row("Project B").parentElement!)).toEqual(["project-b-0", "project-b-1"]);
  await drag(chat("project-a-1"), chat("project-b-0"));
  expect(chatIds(row("Project B").parentElement!)).toEqual(["project-b-0", "project-b-1"]);
  await drag(chat("general-0"), chat("general-1"), true);
  await drag(row("Bot B"), row("Bot A"));
  // A drag must not activate the row when the browser emits a subsequent click.
  await act(async () => chat("general-0").click());
  expect(select).not.toHaveBeenCalled();
  await act(async () => root.unmount()); root = createRoot(host); await render();
  expect(chatIds(host.querySelector('section[aria-label="对话"]')!)).toEqual(["general-1", "general-0"]);
  expect(chatIds(row("Project A").parentElement!)).toEqual(["project-a-1", "project-a-0"]);
  expect([...host.querySelectorAll('nav button[aria-label^="Bot "][aria-label*=","]')].map(item => item.getAttribute("aria-label")?.slice(0, 5))).toEqual(["Bot B", "Bot A"]);
  expect([...host.querySelectorAll('[aria-label^="Project "]')].map(item => item.getAttribute("aria-label"))).toEqual(["Project B", "Project A"]);
  // Normal clicks still open chats after a new pointer interaction.
  await act(async () => { chat("general-0").dispatchEvent(new Event("pointerdown", { bubbles: true })); chat("general-0").click(); });
  expect(select).toHaveBeenCalledWith("general-0");
});

it("keeps groups and identities isolated, and restores time sorting explicitly", async () => {
  await drag(chat("general-1"), chat("project-a-0"));
  expect(chatIds(host.querySelector('section[aria-label="对话"]')!)).toEqual(["general-0", "general-1"]);
  await drag(chat("general-1"), chat("general-0"));
  mockState.accessToken = "identity-b"; await render();
  expect(chatIds(host.querySelector('section[aria-label="对话"]')!)).toEqual(["general-0", "general-1"]);
  mockState.accessToken = "identity-a"; await render();
  expect(chatIds(host.querySelector('section[aria-label="对话"]')!)).toEqual(["general-1", "general-0"]);
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="对话排序"]')!.click());
  const time = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent?.includes("时间"))!;
  await act(async () => time.click());
  expect(chatIds(host.querySelector('section[aria-label="对话"]')!)).toEqual(["general-0", "general-1"]);
});

it("keeps project actions clickable and supports moving a focused row with Alt+Arrow", async () => {
  const project = row("Project A");
  const action = project.querySelector<HTMLButtonElement>('.ui-btn')!;
  await act(async () => action.dispatchEvent(new Event("pointerdown", { bubbles: true })));
  await act(async () => dragEvent(project, "dragstart"));
  await act(async () => dragEvent(row("Project B"), "drop", true));
  expect([...host.querySelectorAll('[aria-label^="Project "]')].map(item => item.getAttribute("aria-label"))).toEqual(["Project A", "Project B"]);
  await act(async () => chat("general-1").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true })));
  expect(chatIds(host.querySelector('section[aria-label="对话"]')!)).toEqual(["general-1", "general-0"]);
});
