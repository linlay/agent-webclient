/** @jest-environment jsdom */
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import {useAgentInteraction} from "./useAgentInteraction";
import {interactionDefaults} from "@/shared/contracts/interaction";
import type {CurrentWorkerSummary} from "@/features/workers/lib/currentWorker";

const mockGetAgent = jest.fn();
const mockDispatch = jest.fn();
const mockStateRef = {current: {agents: [{key: "saved-agent", name: "Saved"}]}};
jest.mock("@/shared/data", () => ({getAgent: (...args: unknown[]) => mockGetAgent(...args)}));
jest.mock("@/app/state/AppContext", () => ({useAppContext: () => ({dispatch: mockDispatch, stateRef: mockStateRef, state: mockStateRef.current})}));

it.each(["REACT", "CODER"])("stores %s detail selection with interaction config", async mode => {
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  mockDispatch.mockClear();
  const config = interactionDefaults(mode);
  mockGetAgent.mockResolvedValue({data: {key: "saved-agent", mode, interactionConfig: config,
    modelKey: "saved-model", reasoningEffort: "NONE", serviceTier: "STANDARD"}});
  const worker = {type: "agent", sourceId: "saved-agent", raw: {mode}} as CurrentWorkerSummary;
  function Harness() { useAgentInteraction(worker); return null; }
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(Harness)));
    expect(mockDispatch).toHaveBeenCalledWith({type: "SET_AGENTS", agents: [expect.objectContaining({
      key: "saved-agent", modelKey: "saved-model", reasoningEffort: "NONE", serviceTier: "STANDARD", interactionConfig: config,
    })]});
  } finally { act(() => root.unmount()); }
});

it.each(["main", "worker"])("uses BOT %s composer rules without changing Agent config", async chatId => {
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const config = {...interactionDefaults("GENERAL"), model:true, showPlanningMode:true, showTerminal:true, showEditingMode:true};
  Object.assign(mockStateRef.current, {chatId, chats:[{chatId, agentKey:"bot"}], agents:[{key:"bot",name:"Bot",mode:"BOT",primaryChat:{chatId:"main"}}]});
  const worker = {type:"agent",sourceId:"bot",raw:{mode:"BOT",interactionConfig:config}} as unknown as CurrentWorkerSummary;
  let resolved: ReturnType<typeof useAgentInteraction> | undefined;
  function Harness(){resolved=useAgentInteraction(worker);return null;}
  const host=document.createElement("div");const root=createRoot(host);
  try {await act(async()=>root.render(React.createElement(Harness)));
    expect(resolved).toMatchObject({showPlanningMode:false,showTerminal:false,model:chatId!=="main",showEditingMode:chatId!=="main"});
    expect(config.showPlanningMode).toBe(true);expect(config.model).toBe(true);
  } finally {act(()=>root.unmount());}
});
