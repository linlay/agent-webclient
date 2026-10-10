/** @jest-environment jsdom */
import React, { act, useCallback, useMemo, useReducer } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QuerySettingsControls, clearCoderModelOptionsCacheForTest } from "./QuerySettingsControls";
import { createInitialState } from "@/app/state/state";
import { appReducer } from "@/app/state/reducer";
import type { AppState } from "@/app/state/types";
import type { AppAction } from "@/app/state/actions";
import type { QueryModelOverride } from "@/shared/data";
import { readComposerModel } from "../lib/composerModelSelection";
import { resolveComposerAccessScope } from "../lib/composerAccessLevel";
import { interactionDefaults } from "@/shared/contracts/interaction";
import { updateAgentModelConfig } from "@/shared/data";

let mockModelAllowed = true;
let mockContext: { state: AppState; dispatch: React.Dispatch<AppAction> };
jest.mock("@/app/state/AppContext", () => ({ useAppContext: () => mockContext }));
jest.mock("@/features/workers/lib/currentWorker", () => ({ resolveCurrentWorkerSummary: () => ({
  type: "agent", sourceId: "agent", raw: mockContext.state.agents[0],
}) }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock("@/shared/data", () => ({
  getModelOptions: jest.fn(async () => ({ data: { models: [
    { key: "old-model", name: "Old Model" }, { key: "new-model", name: "New Model" },
  ], reasoningEfforts: [{ key: "LOW", label: "Low" }, { key: "HIGH", label: "High" }] } })),
  updateAgentModelConfig: jest.fn(),
}));
jest.mock("antd", () => {
  const React = jest.requireActual("react");
  return { ...jest.requireActual("antd"), Dropdown: ({ menu, children }: any) => React.createElement("div", null, children,
    !menu.selectedKeys && React.createElement("button", { "data-test": "model", onClick: () => menu.onClick({key:"model:new-model"}) }, "select model"),
    !menu.selectedKeys && React.createElement("button", { "data-test": "reasoning", onClick: () => menu.onClick({key:"reasoning:HIGH"}) }, "select reasoning")) };
});

function Harness() {
  const [state, dispatch] = useReducer(appReducer, undefined, () => ({ ...createInitialState(),
    agents: [{ key: "agent", name: "Agent", mode: "GENERAL", modelKey: "old-model", reasoningEffort: "LOW" as const }],
  }));
  mockContext = { state, dispatch };
  const target = useMemo(() => ({ scope: resolveComposerAccessScope(state.accessToken), chatId: state.chatId, agentKey: "agent" }), [state.chatId, state.accessToken]);
  const onChange = useCallback((value: QueryModelOverride) => dispatch({ type: "SET_COMPOSER_MODEL", target, value }), [target]);
  return <QuerySettingsControls accessLevel="default" modelOverride={readComposerModel(state, target)}
    onAccessLevelChange={() => {}} onModelOverrideChange={onChange} interactionConfig={{...interactionDefaults("GENERAL"), model: mockModelAllowed}} />;
}
let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockModelAllowed = true;
  sessionStorage.clear(); clearCoderModelOptionsCacheForTest();
  (updateAgentModelConfig as jest.Mock).mockReset().mockImplementation(async input => ({ data: { agentKey: "agent", ...input } }));
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function click(name: string) { await act(async () => container.querySelector<HTMLButtonElement>(`[data-test="${name}"]`)!.click()); }
async function loadOld() {
  await act(async () => mockContext.dispatch({ type: "APPLY_CONVERSATION_REPLAY", snapshot: {
    ...createInitialState(), chatId: "old-chat", events: [{ type: "request.query", chatId: "old-chat", runId: "old-run", query: { model: { key: "old-model", reasoningEffort: "LOW" } } }],
  } }));
}
it("keeps old Chat model/effort after New Chat changes, and edits old Chat without changing Agent defaults", async () => {
  await act(async () => root.render(<Harness />));
  await click("model"); await click("reasoning");
  expect(updateAgentModelConfig).toHaveBeenCalledTimes(2);
  await loadOld();
  expect(container.textContent).toContain("Old Model");
  expect(container.textContent).toContain("composer.query.reasoning.LOW");
  await click("reasoning");
  expect(updateAgentModelConfig).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("composer.query.reasoning.HIGH");
  await act(async () => mockContext.dispatch({ type: "SET_CHAT_ID", chatId: "" }));
  expect(container.textContent).toContain("New Model");
  await loadOld();
  expect(container.textContent).toContain("Old Model");
  expect(container.textContent).toContain("composer.query.reasoning.HIGH");
});
it("a late New Chat save cannot overwrite the old Chat selected while it was pending", async () => {
  let finish!: (value: unknown) => void;
  (updateAgentModelConfig as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => root.render(<Harness />));
  await click("model");
  await loadOld();
  await act(async () => finish({ data: { agentKey: "agent", modelKey: "new-model", reasoningEffort: "HIGH" } }));
  expect(container.textContent).toContain("Old Model");
  expect(container.textContent).toContain("composer.query.reasoning.LOW");
});

it("keeps the Chat preference while model capability is temporarily unavailable", async () => {
  await act(async () => root.render(<Harness />));
  await loadOld(); await click("reasoning");
  mockModelAllowed = false;
  await act(async () => root.render(<Harness />));
  mockModelAllowed = true;
  await act(async () => root.render(<Harness />));
  expect(container.textContent).toContain("Old Model");
  expect(container.textContent).toContain("composer.query.reasoning.HIGH");
  expect(updateAgentModelConfig).not.toHaveBeenCalled();
});
