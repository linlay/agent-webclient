/** @jest-environment jsdom */
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import {createInitialState} from "@/app/state/state";
import {I18nProvider} from "@/shared/i18n";
import {BotChatHeader} from "./BotChatHeader";

const mockState = createInitialState();
const mockGetChats = jest.fn();
jest.mock("@/app/state/AppContext", () => ({useAppState: () => mockState}));
jest.mock("@/shared/data", () => ({getChats: (...args: unknown[]) => mockGetChats(...args)}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, "matchMedia", {writable:true,value:(query:string)=>({matches:false,media:query,onchange:null,
  addListener:jest.fn(),removeListener:jest.fn(),addEventListener:jest.fn(),removeEventListener:jest.fn(),dispatchEvent:jest.fn()})});

beforeEach(() => {
  Object.assign(mockState, createInitialState(), {chatId:"worker", chats:[{chatId:"worker",agentKey:"bot"}],
    agents:[{key:"bot", name:"My Bot",mode:"BOT",primaryChat:{chatId:"main"}}]});
  mockGetChats.mockReset();
});

it("opens durable worker history and navigates back to the main Chat", async () => {
  mockGetChats.mockResolvedValue({data:[{chatId:"previous-worker",chatName:"Prior work",lastRunId:"previous-run"}]});
  const host = document.createElement("div");document.body.append(host);
  const root = createRoot(host);
  const loaded = jest.fn();window.addEventListener("agent:load-chat",loaded);
  try {
    await act(async()=>root.render(<I18nProvider locale="en-US" persistLocale={false}><BotChatHeader /></I18nProvider>));
    const buttons = () => [...document.querySelectorAll<HTMLButtonElement>("button")];
    const back = buttons().find(button=>button.textContent?.includes("Back to bot main chat"));
    expect(back).toBeDefined();
    await act(async()=>back!.click());
    expect((loaded.mock.calls[0][0] as CustomEvent).detail).toEqual({chatId:"main"});
    const history = buttons().find(button=>button.textContent?.includes("Worker history"));
    expect(history).toBeDefined();
    await act(async()=>history!.click());
    expect(mockGetChats).toHaveBeenCalledWith({agentKey:"bot",primary:false,limit:50});
    const previous = buttons().find(button=>button.textContent?.includes("Prior work"));
    expect(previous).toBeDefined();
    await act(async()=>previous!.click());
    expect((loaded.mock.calls[1][0] as CustomEvent).detail).toEqual({chatId:"previous-worker"});
  } finally {window.removeEventListener("agent:load-chat",loaded);await act(async()=>root.unmount());host.remove();}
});

it("does not show BOT controls for an ordinary Chat", async () => {
  mockState.agents[0].mode="GENERAL";
  const host=document.createElement("div");const root=createRoot(host);
  try {await act(async()=>root.render(<BotChatHeader />));expect(host.textContent).toBe("");expect(mockGetChats).not.toHaveBeenCalled();}
  finally {await act(async()=>root.unmount());}
});
